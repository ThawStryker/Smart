# Comet Design Handoff

- Change: refactor-agent-engine-phase-driven
- Phase: design
- Mode: compact
- Context hash: 7aadc7c8482d7b139161b2500416b6147ca77fc6add8d0e08f5ccbf9d208d063

Generated-by: comet-handoff.sh

OpenSpec remains the canonical capability spec. This handoff is a deterministic, source-traceable context pack, not an agent-authored summary.

## openspec/changes/refactor-agent-engine-phase-driven/proposal.md

- Source: openspec/changes/refactor-agent-engine-phase-driven/proposal.md
- Lines: 1-42
- SHA256: 4beab7288b19a524fafb7c2e29231bbfcaf7d3d605e4a6b5efe37e1193dd8782

```md
## Why

当前 Agent Engine 采用"事件驱动 + 前端推断"架构：engine 发出 `tool_exec`、`thinking`、`agent_start` 等原始事件，前端通过 `hasRichStepsRef`、`toolMeta` 映射表、`HIDDEN_TOOLS` 等逻辑推断该显示什么卡片。这导致引擎和前端职责边界模糊——前端在"猜测"引擎意图，任何 tool 增删都需两端同步修改。将引擎改为 Phase 驱动，使其成为显示逻辑的唯一权威，前端只做纯渲染。

## What Changes

- **新建 `engine.ts`**：替代 `loop.ts`，以 AsyncGenerator 输出 PhaseEvent 流，不再通过 eventQueue 轮询
- **新建 `phases.ts`**：定义 9 个 Phase 枚举及工具→Phase 映射
- **新建类型定义**：`EngineInput`、`EngineOutput`、`PhaseEvent`、`ToolHandler` 等接口
- **修改 `chat.ts`**：组装模块、注入 toolHandlers、消费 PhaseEvent 流
- **修改 `ChatPanel.tsx`**：删除 `hasRichStepsRef`、`HIDDEN_TOOLS`、`streamStepsRef` 等推断逻辑，改为纯 phase 驱动渲染
- **修改 tools 系统**：给每个注册工具加 `phase` 和 `meta` 字段，`file-ops.ts` 拆出 `createFile`/`writeContent` 底层方法
- **重写 `stream.ts`**：用 AsyncGenerator 替代 eventQueue 轮询
- **删除**：`loop.ts` 中的 LLM 调用循环、前端推断相关 ref 和 state
- **不变**：`context.ts`、`loader.ts`、`models.ts`、所有 Coding 页面代码

## Capabilities

### New Capabilities

- `agent-engine-phase-protocol`: Phase 事件协议——Engine 输出标准化 PhaseEvent（phase/delta/done），前端按 phase 类型渲染对应卡片，不做任何推断
- `tool-handler-injection`: 工具回调注入——上层组装时注入 `{ phase, execute, meta }` 的 ToolHandler，Engine 不关心工具实现细节
- `async-generator-stream`: AsyncGenerator SSE 流——替代 eventQueue 轮询，用 for-await 消费 PhaseEvent 并推送 SSE

### Modified Capabilities

<!-- 本次为全新架构，不修改已有 spec -->

## Impact

| 层次 | 影响 |
|------|------|
| `server/src/agent/mose/engine.ts` | **新建** — Phase 驱动引擎核心 |
| `server/src/agent/mose/phases.ts` | **新建** — Phase 定义 + 映射 |
| `server/src/agent/mose/types.ts` | **修改** — 新增 EngineInput/EngineOutput/PhaseEvent/ToolHandler 类型 |
| `server/src/agent/mose/loop.ts` | **删除** — 被 engine.ts 替代 |
| `server/src/agent/mose/tools/index.ts` | **修改** — 统一走 registry，加 phase/meta |
| `server/src/agent/mose/tools/file-ops.ts` | **修改** — 拆分 writeFile 为 createFile + writeContent |
| `server/src/agent/mose/tools/registry.ts` | **修改** — ToolDef 加 phase/meta 字段 |
| `server/src/agent/stream.ts` | **重写** — AsyncGenerator 替代 eventQueue |
| `server/src/routes/work/chat.ts` | **修改** — 组装模块、注入回调 |
| `web/src/components/work/ChatPanel.tsx` | **修改** — 简化为 phase 驱动渲染 |
```

## openspec/changes/refactor-agent-engine-phase-driven/design.md

- Source: openspec/changes/refactor-agent-engine-phase-driven/design.md
- Lines: 1-158
- SHA256: afb1158f0e0a1a011eb498df3ca6838ade5e1e99cafcdb101ba8baf7ab41c967

[TRUNCATED]

```md
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
```

Full source: openspec/changes/refactor-agent-engine-phase-driven/design.md

## openspec/changes/refactor-agent-engine-phase-driven/tasks.md

- Source: openspec/changes/refactor-agent-engine-phase-driven/tasks.md
- Lines: 1-63
- SHA256: 1f39cb10e873c83c55924523ffdba643088e6fd965d4084896fca932beaeec1f

```md
## 1. 类型定义

- [ ] 1.1 在 `types.ts` 新增 `PhaseName` 类型、`PhaseEvent` 类型、`EngineInput`/`EngineOutput` 接口、`ToolHandler` 接口
- [ ] 1.2 新增 `ModelConfig` 接口（从 `MoseLoopParams` 提取），新增 `PhaseControl` 接口

## 2. Phase 定义

- [ ] 2.1 新建 `phases.ts`，定义 9 个 Phase 枚举及中文标签
- [ ] 2.2 定义工具名→Phase 默认映射表（`DEFAULT_TOOL_PHASE`）

## 3. 工具系统改造

- [ ] 3.1 修改 `registry.ts`，`ToolDef` 加 `phase` 和 `meta` 字段
- [ ] 3.2 给 `memory.ts` 的 `memory_save`/`memory_recall` 注册 phase="memory"
- [ ] 3.3 给 `skill-tools.ts` 的 `skill_list`/`skill_view` 注册 phase="skill"
- [ ] 3.4 给 `web-search.ts` 注册 phase="search"
- [ ] 3.5 修改 `file-ops.ts`，拆出 `createFile()` 和 `writeContent()` 底层方法，保留 `writeFile()` 作为组装入口
- [ ] 3.6 给 `file-ops.ts` 的 `write_file`/`read_file`/`list_files` 注册 phase="write"/"read"/"read"
- [ ] 3.7 修改 `call-agent.ts`，注册 phase="agent_start"，execute 返回后 engine 层 emit agent_done
- [ ] 3.8 修改 `tools/index.ts`，移除 `executeAgentTool` 的 switch 分发和 `AGENT_TOOLS` 常量，统一走 registry

## 4. SSE 流重写

- [ ] 4.1 重写 `stream.ts`，用 AsyncGenerator 替代 eventQueue 轮询
- [ ] 4.2 移除 `emit()` 全局函数和 `SSE_HEADERS` 中的轮询逻辑

## 5. Engine 核心

- [ ] 5.1 新建 `engine.ts`，实现 `run()` AsyncGenerator 函数
- [ ] 5.2 实现 Phase 1: thinking — LLM 调用，流式 yield thinking delta，处理 tool_calls
- [ ] 5.3 实现 Phase 2: read/memory/skill/search — 按 tool handler phase 自动标注
- [ ] 5.4 实现 Phase 3: write — write_file 特殊处理（先 yield phase+meta，再 delta 内容）
- [ ] 5.5 实现 Phase 4: agent_start/agent_done — call_agent 的嵌套 phase 处理
- [ ] 5.6 实现 Phase 5: text — 最终流式文本输出
- [ ] 5.7 实现兜底检查 — enforceWriteFile 时追加 nudge 轮
- [ ] 5.8 实现 Yumi 直接聊天路径（tools=[] 时跳过工具循环）

## 6. 路由层改造

- [ ] 6.1 修改 `chat.ts`，组装 toolHandlers 映射并注入 Engine
- [ ] 6.2 用 `createSSEStream(run(input))` 替代 `eventQueue` + `moseLoop` 模式
- [ ] 6.3 移除 `ctx.runInBackground` 包装

## 7. 前端改造

- [ ] 7.1 修改 `ChatPanel.tsx`，重写 `handleSSE` 为 phase 驱动
- [ ] 7.2 删除 `hasRichStepsRef`、`hasRichSteps`、`HIDDEN_TOOLS`、`streamStepsRef` 等推断逻辑
- [ ] 7.3 按 phase 类型渲染对应卡片（thinking/agent_start/agent_done/read/memory/skill/search/write/text）
- [ ] 7.4 `phase: "write"` + `meta.path` → 自动调用 `onOpenFile`

## 8. 清理

- [ ] 8.1 删除 `loop.ts`
- [ ] 8.2 更新 `types.ts`，移除废弃的 `SSEEvent` 中的 `tool_exec`/`agent_start`/`agent_done` 等旧事件类型
- [ ] 8.3 验证 `context.ts`、`loader.ts`、`models.ts` 无需修改

## 9. 验证

- [ ] 9.1 TypeScript 类型检查通过
- [ ] 9.2 验证 agent 模式完整流程：@agent → thinking → read → write → text
- [ ] 9.3 验证 Yumi 直接聊天流程：消息 → thinking → text
- [ ] 9.4 验证 sub-agent 嵌套调用（call_agent → agent_start → ... → agent_done）
- [ ] 9.5 验证 streaming 期间文件自动打开和内容流式追加
```

## openspec/changes/refactor-agent-engine-phase-driven/specs/agent-engine-phase-protocol/spec.md

- Source: openspec/changes/refactor-agent-engine-phase-driven/specs/agent-engine-phase-protocol/spec.md
- Lines: 1-46
- SHA256: 1ea970c7b11a1fe48d16a4e872d30840bdd5be190f4c87bbf89b3d5fe4021dfc

```md
## agent-engine-phase-protocol

Engine 输出标准化 Phase 事件流，前端按 phase 类型渲染对应卡片。

### Phase 事件格式

```typescript
type PhaseEvent =
  | { type: "phase"; phase: PhaseName; meta?: Record<string, unknown> }
  | { type: "delta"; phase: PhaseName; text: string }
  | { type: "done" };
```

### Phase 列表

| Phase | 含义 | 前端卡片 |
|-------|------|---------|
| `thinking` | LLM 思考过程，含 reasoning_content | 💭 Thinking（可折叠） |
| `agent_start` | sub-agent 开始执行 | 🤖 Agent 卡片（展开） |
| `agent_done` | sub-agent 执行完成 | 卡片收起/标记完成 |
| `read` | 读取文件 | 📖 Read xxx.md |
| `memory` | 记忆读写 | 🧠 Memory |
| `skill` | 技能读写 | 🎯 Skill xxx |
| `search` | 网络搜索 | 🔍 Search xxx |
| `write` | 写入文件 | ✍️ Write xxx.md |
| `text` | 最终对话文本 | 无卡片，直接流式 |

### 事件时序

- `phase` 事件声明阶段开始（前端可提前渲染卡片骨架）
- `delta` 事件推送该阶段的流式内容
- 同一 phase 可有多个 delta（如 thinking 阶段分多段推送）
- `done` 事件标记整个流结束

### 前端渲染规则

- 收到 `{ type: "phase", phase: "thinking" }` → 渲染 💭 Thinking 折叠卡片
- 收到 `{ type: "delta", phase: "thinking", text }` → 追加到 Thinking 卡片内容
- 收到 `{ type: "phase", phase: "write", meta: { path } }` → 渲染 ✍️ Write 卡片 + 自动打开文件
- 收到 `{ type: "delta", phase: "text", text }` → 追加到主对话区
- 前端不做任何 phase 推断——phase 字段直接决定渲染

### 向后兼容

- 旧的 `agent_start`/`agent_done`/`tool_exec`/`text`/`thinking` SSE 事件类型全部废弃
- 前端仅处理 PhaseEvent 格式
```

## openspec/changes/refactor-agent-engine-phase-driven/specs/async-generator-stream/spec.md

- Source: openspec/changes/refactor-agent-engine-phase-driven/specs/async-generator-stream/spec.md
- Lines: 1-77
- SHA256: 4c091d07767f2e4b7a4b4c353c7aafa38e744e81f1113e8b827cc68f0f82dfb1

```md
## async-generator-stream

用 AsyncGenerator 替代 eventQueue 数组轮询，简化 SSE 流控制。

### 当前方案（待替换）

```typescript
// 全局 eventQueue 数组 + 轮询
const eventQueue = [];
function emit(queue, data) { queue.push(data); }
function createSSEStream(queue) {
  return new ReadableStream({
    async start(controller) {
      while (true) {
        while (queue.length > 0) {
          const data = queue.shift();
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
          if (data.type === "done") { controller.close(); return; }
        }
        await new Promise(r => setTimeout(r, 50)); // 轮询
      }
    }
  });
}
```

### 新方案

```typescript
export function createSSEStream(
  events: AsyncIterable<PhaseEvent>
): ReadableStream {
  const encoder = new TextEncoder();
  return new ReadableStream({
    async start(controller) {
      for await (const event of events) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        if (event.type === "done") {
          controller.close();
          return;
        }
      }
    },
    cancel() { /* stream cancelled by client */ },
  });
}
```

### Engine 侧

Engine 暴露 `run()` 方法返回 `AsyncIterable<PhaseEvent>`：

```typescript
async function* run(input: EngineInput): AsyncGenerator<PhaseEvent> {
  // Phase: thinking
  yield { type: "phase", phase: "thinking" };
  // ... LLM 调用，yield delta
  yield { type: "done" };
}
```

### chat.ts 集成

```typescript
const events = run(input);
const stream = createSSEStream(events);

// 不再需要 ctx.runInBackground
return new Response(stream, { headers: SSE_HEADERS });
```

### 约束

- `createSSEStream` 不再依赖全局 eventQueue
- 不再需要 `emit()` 全局函数
- 不再需要 `setTimeout` 轮询
- Engine 的 AsyncGenerator 在 `ReadableStream.start()` 中消费，由 CF Worker 管理生命周期
```

## openspec/changes/refactor-agent-engine-phase-driven/specs/tool-handler-injection/spec.md

- Source: openspec/changes/refactor-agent-engine-phase-driven/specs/tool-handler-injection/spec.md
- Lines: 1-78
- SHA256: 1682d4b58b380a8618db6a0fc47bd2b6abee100fcd3d4563dd1d475194847088

```md
## tool-handler-injection

工具回调由上层组装时注入 Engine，Engine 不关心工具实现细节。

### ToolHandler 接口

```typescript
interface ToolHandler {
  execute(args: Record<string, unknown>): Promise<string>;
  phase: PhaseName;
  meta?: (args: Record<string, unknown>) => Record<string, unknown>;
}
```

### 注入方式

上层在 `chat.ts` 中组装 toolHandlers 映射：

```typescript
const toolHandlers: Record<string, ToolHandler> = {
  read_file: {
    execute: (args) => agentModule.readFile(args),
    phase: "read",
    meta: (args) => ({ path: args.path }),
  },
  write_file: {
    execute: (args) => workspaceModule.writeFile(args),
    phase: "write",
    meta: (args) => ({ path: args.path }),
  },
  // ...
};
```

### Engine 内部使用

```
收到 tool_call(name, args):
  handler = toolHandlers[name]
  
  // 1. 声明 phase
  yield { type: "phase", phase: handler.phase, meta: handler.meta?.(args) }
  
  // 2. 执行工具
  result = await handler.execute(args)
  
  // 3. 推送结果
  yield { type: "delta", phase: handler.phase, text: result }
```

### write_file 特殊处理

`write_file` 的 ToolHandler.execute 内部拆分：

```typescript
// file-ops.ts 暴露底层方法
export async function createFile(path, userId): Promise<void> { ... }
export async function writeContent(path, content, userId): Promise<void> { ... }

// ToolHandler 组装
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

Engine 在 write 的 phase 事件中附带 path，前端据此自动打开文件；delta 事件推送文件内容到 DocumentEditor。

### 约束

- 每个工具必须绑定一个 phase
- `meta` 函数可选，用于生成前端卡片元数据
- `execute` 是纯异步函数，不访问 Engine 内部状态
```

