---
comet_change: refactor-agent-engine-phase-driven
role: technical-design
canonical_spec: openspec
---

## Context

当前 Agent Engine (`loop.ts`) 是事件驱动架构：LLM 流式响应中解析 `thinking`/`text`/`tool_calls`，执行工具后 emit 原始事件到 `eventQueue`，前端 `ChatPanel.tsx` 通过 `handleSSE()` 推断显示逻辑。核心问题是**显示逻辑分散在两端**：

- **前端**：`hasRichStepsRef` 判断是否显示 step 卡片、`toolMeta` 映射表查图标、`agent_start`/`agent_done` 控制 agent 卡片
- **后端**：`tool_exec` 事件不区分 phase（read/write/search 都是同一个 type）

任何 tool 增删都需要两端同步修改，前端在"猜测"引擎意图。

## Goals / Non-Goals

**Goals:**
- Engine 通过 Phase 事件显式声明当前在做什么，前端按 phase 类型渲染
- 工具回调由上层注入，Engine 不关心工具实现
- 用 AsyncGenerator 替代 eventQueue 轮询
- `write_file` 在 Engine 内部分两步 emit（phase 声明 + delta 流式推送），LLM 无感知
- Yumi 直接聊天和 Agent 模式统一走 Engine

**Non-Goals:**
- 不实现 `edit_file` 工具（edit phase 留空）
- 不改变 `context.ts`、`loader.ts`、`models.ts`
- 不改变 Coding/Market/Admin 模块
- 不改变 agent 文件存储模型

## Decisions

### 1. Phase 协议

```
PhaseEvent = { type: "phase", phase: PhaseName, meta? }
            | { type: "delta", phase: PhaseName, text: string }
            | { type: "done" }
```

`phase` 事件声明阶段开始（前端据此渲染卡片骨架），`delta` 事件推送该阶段的流式内容。分离让前端可以在收到第一个 delta 前就显示卡片骨架。

### 2. Phase 列表（9 个）

| Phase | 前端渲染 | 触发条件 |
|-------|---------|---------|
| `thinking` | 💭 Thinking（折叠） | LLM reasoning_content + 有 tool_calls 时的 content |
| `agent_start` | 🤖 Agent 卡片 | call_agent 工具被调用 |
| `agent_done` | 卡片收起 | call_agent 返回 |
| `read` | 📖 Read xxx.md | read_file 工具调用 |
| `memory` | 🧠 Memory | memory_save/memory_recall 调用 |
| `skill` | 🎯 Skill xxx | skill_list/skill_view 调用 |
| `search` | 🔍 Search xxx | web_search 工具调用 |
| `write` | ✍️ Write xxx.md | write_file 工具调用 |
| `text` | 无卡片，直接流式 | LLM 最终文本输出 |

### 3. thinking/text 边界判定

- `reasoning_content` → 始终归 thinking，流式推送为 thinking delta
- `content` → 缓冲到 SSE 流结束再判断：
  - 本轮有 tool_calls → 归 thinking，作为 thinking delta 追加
  - 本轮无 tool_calls → 归 text，流式推送为 text delta

最终回复直接流式显示在对话区，分析过程折叠。

### 4. call_agent 嵌套流

子 agent 的 PhaseEvent 通过 `yield*` 嵌入主流，在 `agent_start`/`agent_done` 之间：

```
主 Engine:
  yield { type: "phase", phase: "agent_start", meta: { agentName } }
  yield* subEngine.run()   // 子 agent 的完整 phase 流
  yield { type: "phase", phase: "agent_done", meta: { agentName } }
```

前端 🤖 卡片展开后内部渲染子 phase。子 Engine 的 `done` 事件不关闭主 SSE 流——只有顶层 `done` 才关闭。

### 5. write_file 桥接 DocumentEditor

Engine 收到 write_file tool_call 时：

1. `yield { type: "phase", phase: "write", meta: { path } }` → 前端调 `onOpenFile(path)`
2. `yield { type: "delta", phase: "write", text: content }` → 前端调 `onDocDelta(path, text)`

`file-ops.ts` 暴露 `createFile(path, userId)` 和 `writeContent(path, content, userId)` 两个底层方法。chat.ts 组装时串联：

```typescript
write_file: {
  execute: async (args) => {
    await createFile(args.path, userId);
    await writeContent(args.path, args.content, userId);
    return `File written: ${args.path}`;
  },
  phase: "write",
  meta: (args) => ({ path: args.path }),
}
```

### 6. 工具系统架构

```
registry.ts（工具定义注册中心）
  ├─ register({ name, description, parameters, phase, meta?, handler })
  ├─ getOpenAITools() → 给 LLM 看的工具定义数组
  └─ get(name) → ToolDef

tools/*.ts（工具实现）
  ├─ memory.ts → 注册 memory_save / memory_recall（phase: memory）
  ├─ skill-tools.ts → 注册 skill_list / skill_view（phase: skill）
  ├─ web-search.ts → 注册 web_search（phase: search）
  ├─ file-ops.ts → 注册 write_file / read_file / list_files（phase: write/read/read）
  └─ call-agent.ts → 注册 call_agent（phase: agent_start）

chat.ts（组装层）
  ├─ 遍历 registry，为每个工具构建 ToolHandler
  ├─ 闭包注入 userId / sessionId / agentName / runSubAgent
  └─ 传给 Engine.run({ toolHandlers, ... })
```

### 7. 上下文注入（闭包模式）

```typescript
// chat.ts
function buildToolHandlers(ctx: { userId, sessionId, agentName, runSubAgent }) {
  const handlers: Record<string, ToolHandler> = {};
  for (const tool of registry.getAll()) {
    handlers[tool.name] = {
      execute: (args) => tool.handler(args, ctx),
      phase: tool.phase,
      meta: tool.meta,
    };
  }
  return handlers;
}
```

`call_agent` 的 `runSubAgent` 是 Engine 内部创建的递归入口，传给 `chat.ts` 组装时闭包捕获。

### 8. SSE 流架构

```typescript
// stream.ts
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

// chat.ts
const events = run(input);
const stream = createSSEStream(events);
return new Response(stream, { headers: SSE_HEADERS });
```

不再需要 `ctx.runInBackground`。`ReadableStream` 作为 Response body 会保持 CF Worker 存活直到流关闭。

### 9. 前端渲染规则

前端收到 PhaseEvent 后的路由：

| 事件 | 渲染动作 |
|------|---------|
| `{ type: "phase", phase: "thinking" }` | 渲染 💭 Thinking 折叠卡片 |
| `{ type: "delta", phase: "thinking", text }` | 追加到 Thinking 卡片内容 |
| `{ type: "phase", phase: "agent_start", meta: { agentName } }` | 渲染 🤖 Agent 卡片（展开） |
| `{ type: "delta", phase: "agent_start", text }` | 追加到 Agent 卡片内的对话区 |
| `{ type: "phase", phase: "agent_done" }` | Agent 卡片收起 |
| `{ type: "phase", phase: "read", meta: { path } }` | 渲染 📖 Read 卡片 |
| `{ type: "phase", phase: "memory" }` | 渲染 🧠 Memory 卡片 |
| `{ type: "phase", phase: "skill", meta: { name } }` | 渲染 🎯 Skill 卡片 |
| `{ type: "phase", phase: "search", meta: { query } }` | 渲染 🔍 Search 卡片 |
| `{ type: "phase", phase: "write", meta: { path } }` | 渲染 ✍️ Write 卡片 + `onOpenFile(path)` |
| `{ type: "delta", phase: "write", text }` | `onDocDelta(path, text)` 追加到编辑器 |
| `{ type: "delta", phase: "text", text }` | 追加到对话栏 |
| `{ type: "done" }` | 流结束，触发 `onStreamEnd` |

前端不做任何 phase 推断——phase 字段直接决定渲染。删除 `hasRichStepsRef`、`streamStepsRef`、`HIDDEN_TOOLS` 等推断逻辑。

## Risks / Trade-offs

- **thinking delta 量增加**：DeepSeek 的 reasoning_content 可能很长。折叠卡片天然处理——默认折叠，用户手动展开
- **content 缓冲延迟**：有 tool_calls 时需要等 SSE 流结束才能判断归属。但 content 通常在 tool_calls 之前到达，实际延迟 < 100ms
- **递归 Engine**：call_agent 创建子 Engine 实例，嵌套 AsyncGenerator。子 Engine 的 `done` 事件不提前关闭主 SSE 流——Engine 内部检查 phaseStack 深度，只有 depth=0 时才 yield `done`
- **前端重构范围**：ChatPanel.tsx 的 `handleSSE` 逻辑改动较大。按 phase 类型 switch 渲染，每个 phase 有独立渲染函数
- **类型定义膨胀**：新增 `PhaseName`、`PhaseEvent`、`EngineInput`、`EngineOutput`、`ToolHandler`、`ModelConfig`、`PhaseControl` 等类型。集中在 `types.ts`

## Testing Strategy

- **Engine 单元测试**：mock `fetch` 返回固定 SSE 流，验证 phase 事件序列和顺序
- **集成测试**：完整 agent 流程（@agent → thinking → read → write → text）
- **前端回归**：
  1. Yumi 直接聊天：消息 → thinking → text
  2. Agent 模式：@agent → thinking → read/write/search → text
  3. Sub-agent 嵌套：call_agent → agent_start → 子 phase 流 → agent_done → 继续主流程
- **Streaming 验证**：write_file 时文件自动打开 + 内容流式追加到 DocumentEditor

## Open Questions

无。所有设计决策已确认。
