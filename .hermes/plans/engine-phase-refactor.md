# Engine 重构 — Phase-Driven 架构

## 目标

将 agent engine 从"事件驱动 + 前端推断"改为"Phase 驱动 + 前端纯渲染"。
Engine 是唯一权威，决定显示什么；前端只做渲染，不做判断。

## 五模块解耦

```
Chat 模块 → 组装 engine 调用，消费 phase 事件，不判断内容
Agent 模块 → 提供 agent context + agent 文件读写回调
Workspace 模块 → 提供 workspace 文件 CRUD 回调
Document 模块 → 编辑器状态，流式追加，保存
Engine 模块 → 纯计算，接收 prompt + tools + handlers，输出 phase 事件流
```

## Phase 协议

| Phase | 前端卡片 | 说明 |
|-------|---------|------|
| thinking | 💭 Thinking（折叠） | 不需要用户看到的文本，含 DeepSeek reasoning_content |
| read | 📖 Read xxx.md | 读取 context/ 文件 |
| memory | 🧠 Memory | 读取/写入 memory/ 文件 |
| skill | 🎯 Skill xxx | 读取/写入/创建 skill |
| search | 🔍 Search xxx | 网络搜索 |
| write | ✍️ Write xxx.md | 写入 workspace → 刷新文件树 → 自动打开 |
| edit | ✏️ Edit xxx.md | 编辑 workspace 文件 |
| text | 无卡片，直接流式文本 | 对话内容 |
| done | 暂空 | 预留 |

## Engine 接口

```typescript
interface EngineInput {
  systemPrompt: string;
  userMessage: string;
  modelConfig: ModelConfig;
  tools: ToolDef[];
  toolHandlers: Record<string, ToolHandler>;
  phaseControl: {
    firstRoundReadOnly: boolean;   // 第一轮不带 write_file
    enforceWriteFile: boolean;     // 循环结束检查是否调过 write_file
  };
}

interface EngineOutput {
  stream: AsyncIterable<PhaseEvent>;
}

type PhaseEvent =
  | { type: "phase"; phase: PhaseName; meta?: Record<string, unknown> }
  | { type: "delta"; phase: PhaseName; text: string }
  | { type: "done" };
```

## 工具回调注入

```typescript
interface ToolHandler {
  execute(args: Record<string, unknown>): Promise<string>;
  phase: PhaseName;  // 这个工具触发什么 phase
  meta?: (args: Record<string, unknown>) => Record<string, unknown>;  // 卡片元数据
}
```

上层组装：
```typescript
const toolHandlers = {
  read_file: {
    execute: agentModule.readFile,
    phase: "read",
    meta: (args) => ({ path: args.path }),
  },
  write_file: {
    execute: workspaceModule.writeFile,
    phase: "write",
    meta: (args) => ({ path: args.path }),
  },
  // ...
};
```

## 执行流程

```
1. Phase: thinking
   - LLM 调用（不带 write_file/edit_file）
   - 流式输出 reasoning_content + content → thinking delta
   - 如果有 tool_calls（read_file, skill_view 等）→ 执行
   - 如果 LLM 反问用户 → 终止，text 输出问题

2. Phase: read/memory/skill/search（按 tool 类型自动标注）
   - LLM 调用（全工具）
   - 每个 tool_call → emit phase 事件 → 执行 → 推结果
   - 循环直到无 tool_calls

3. Phase: write/edit
   - write_file 被调用时：
     a. workspaceModule.createFile(path) — 创建空文件
     b. emit({ type: "phase", phase: "write", meta: { path } })
     c. workspaceModule.writeContent(path, content) — 写入内容
     d. emit({ type: "delta", phase: "write", text: content })

4. Phase: text
   - 无 tool_calls 时，剩余 content → text 流式输出

5. 兜底检查
   - 如果 enforceWriteFile && 没调过 write_file
   - 追加一轮 nudge："请使用 write_file 保存文档"
```

## 文件改动清单

### 新建
- `server/src/agent/mose/engine.ts` — 新 engine 核心（替代 loop.ts）
- `server/src/agent/mose/phases.ts` — phase 定义 + 工具→phase 映射
- `server/src/agent/mose/types.ts` — 更新类型定义

### 修改
- `server/src/agent/mose/tools/index.ts` — 工具改为回调注入模式
- `server/src/agent/mose/tools/file-ops.ts` — 拆分 write_file 为 createFile + writeContent
- `server/src/routes/work/chat.ts` — 组装模块，注入回调
- `web/src/components/work/ChatPanel.tsx` — 简化为 phase 驱动渲染

### 删除
- 前端 HIDDEN_TOOLS、hasRichStepsRef、streamStepsRef 等推断逻辑

## 不变的部分
- `server/src/agent/mose/context.ts` — prompt 拼装
- `server/src/agent/mose/loader.ts` — 文件加载
- `server/src/models.ts` — 模型配置
- 所有 Coding 页面代码
