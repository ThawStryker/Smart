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
