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
