## Context

当前 Agent Engine (`loop.ts`) 是事件驱动架构：LLM 流式响应中解析 `thinking`/`text`/`tool_calls`，执行工具后 emit 原始事件到 `eventQueue`，前端 `ChatPanel.tsx` 通过 `handleSSE()` 推断显示逻辑。核心问题是**显示逻辑分散在两端**：

- **前端**：`hasRichStepsRef` 判断是否显示 step 卡片、`toolMeta` 映射表查图标、`HIDDEN_TOOLS` 过滤工具、`agent_start`/`agent_done` 控制 agent 卡片
- **后端**：`tool_exec` 事件不区分 phase（read/write/search 都是同一个 type）

这导致任何 tool 增删都需要两端同步修改，前端在"猜测"引擎意图。

## Goals / Non-Goals

**Goals:**
- Engine 通过 Phase 事件显式声明当前在做什么，前端按 phase 类型渲染
- 工具回调由上层注入，Engine 不关心工具实现
- 用 AsyncGenerator 替代 eventQueue 轮询，简化流控制
- `write_file` 在 Engine 内部分两步 emit（phase 声明 + delta 流式推送），LLM 无感知
- Yumi 直接聊天和 Agent 模式统一走 Engine

**Non-Goals:**
- 不实现 `edit_file` 工具（edit phase 留空）
- 不改变 `context.ts`、`loader.ts`、`models.ts`
- 不改变 Coding/Market/Admin 模块
- 不改变 agent 文件存储模型

## Decisions

### 1. Phase 协议设计

```
PhaseEvent = { type: "phase", phase: PhaseName, meta? }
            | { type: "delta", phase: PhaseName, text: string }
            | { type: "done" }
```

`phase` 事件声明阶段开始（前端据此渲染卡片头部），`delta` 事件推送该阶段的流式内容。这种分离让前端可以在收到第一个 delta 前就显示卡片骨架。

### 2. Phase 列表

| Phase | 前端渲染 | 触发条件 |
|-------|---------|---------|
| `thinking` | 💭 Thinking（折叠） | LLM reasoning_content 或非工具内容 |
| `agent_start` | 🤖 Agent 卡片 | call_agent 工具被调用 |
| `agent_done` | 卡片收起/标记完成 | call_agent 返回 |
| `read` | 📖 Read xxx.md | read_file 工具调用 |
| `memory` | 🧠 Memory | memory_save/memory_recall 调用 |
| `skill` | 🎯 Skill xxx | skill_list/skill_view 调用 |
| `search` | 🔍 Search xxx | web_search 工具调用 |
| `write` | ✍️ Write xxx.md | write_file 工具调用 |
| `text` | 流式文本 | LLM 最终文本输出 |

### 3. ToolHandler 注入模式

```typescript
interface ToolHandler {
  execute(args: Record<string, unknown>): Promise<string>;
  phase: PhaseName;
  meta?: (args: Record<string, unknown>) => Record<string, unknown>;
}
```

上层在 `chat.ts` 组装 toolHandlers，Engine 在工具执行前后 emit phase/delta 事件。Engine 不调用 `emit()` 全局函数——而是 yield PhaseEvent。

### 4. write_file 内部分拆

```
Engine 收到 write_file tool_call:
  phase = toolHandler.phase  // "write"
  meta  = toolHandler.meta(args)  // { path: "workspace/foo.md" }
  
  1. yield { type: "phase", phase: "write", meta }
  2. result = await toolHandler.execute(args)  // 内部调 createFile + writeContent
  3. yield { type: "delta", phase: "write", text: args.content }
```

`file-ops.ts` 暴露 `createFile(path)` 和 `writeContent(path, content)` 两个底层方法，但注册给 LLM 的仍是 `write_file` 一个工具。LLM 无感知。

### 5. 执行流程

```
Phase: thinking
  ├─ LLM 调用（全工具），流式输出 reasoning_content
  ├─ yield { type: "delta", phase: "thinking", text: "..." }
  ├─ 如果有 tool_calls → 执行工具，emit 对应 phase
  └─ 循环直到无 tool_calls

Phase: read/memory/skill/search
  ├─ 按 tool 类型自动选择 phase
  ├─ yield { type: "phase", phase: "read", meta: { path } }
  ├─ 执行工具
  └─ yield { type: "delta", phase: "read", text: result }

Phase: write
  ├─ 同上，但在 execute 前 emit phase 声明
  └─ delta 推送文件内容

Phase: agent_start/agent_done
  ├─ call_agent 工具被调用时 emit agent_start
  └─ call_agent 返回时 emit agent_done

Phase: text
  └─ 无 tool_calls 时，剩余 content → text 流式输出

兜底检查
  └─ enforceWriteFile && 没调过 write_file → 追加一轮 nudge
```

### 6. Engine 接口

```typescript
interface EngineInput {
  systemPrompt: string;
  userMessage: string;
  modelConfig: ModelConfig;
  tools: ToolDef[];
  toolHandlers: Record<string, ToolHandler>;
  phaseControl: {
    firstRoundReadOnly: boolean;
    enforceWriteFile: boolean;
  };
}

interface EngineOutput {
  stream: AsyncIterable<PhaseEvent>;
}
```

### 7. Yumi 直接聊天

`tools: []`，`phaseControl: { firstRoundReadOnly: false, enforceWriteFile: false }`。Engine 内直接走 thinking → text 路径，无工具循环。

### 8. SSE 流重写

用 AsyncGenerator 替代 eventQueue 轮询：

```typescript
export function createSSEStream(
  events: AsyncIterable<PhaseEvent>
): ReadableStream {
  const encoder = new TextEncoder();
  return new ReadableStream({
    async start(controller) {
      for await (const event of events) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        if (event.type === "done") { controller.close(); return; }
      }
    },
  });
}
```

不再需要 `setTimeout(50)` 轮询和全局 `emit()`。

## Risks / Trade-offs

- **Phase 事件量增加**：每次工具调用多 emit 2 个事件（phase + delta），比原来多 ~30% SSE 消息量。但每条消息极小（<200 字节），不影响性能
- **前端重构风险**：`ChatPanel.tsx` 的 `handleSSE` 逻辑改动较大。缓解：保持 SSE 事件结构向后兼容，先加 phase 事件，前端逐步切换
- **call_agent 递归**：sub-agent 调用时 agent_start/agent_done 的嵌套需要正确处理。缓解：Engine 内部用 phaseStack 跟踪嵌套层级
- **类型定义膨胀**：新增 `EngineInput`、`EngineOutput`、`PhaseEvent`、`ToolHandler` 等类型。缓解：集中在 `types.ts`，不分散
