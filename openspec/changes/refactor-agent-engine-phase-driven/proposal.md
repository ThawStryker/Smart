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
