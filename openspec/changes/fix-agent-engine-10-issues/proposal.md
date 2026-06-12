# Proposal: 修复 Agent 引擎 10 个问题

## 背景

Smart 平台的 Agent 引擎（`server/src/agent/`）存在一系列影响稳定性、性能和代码质量的问题，分布在 mose 引擎、vibe 引擎、前后端代码中。这些问题是日常开发和测试中逐渐积累的，需要系统性修复。

## 目标

按优先级分三批修复 10 个问题：

### P0 — 紧急（影响功能正确性）
1. **P0-1**: mose/loop.ts 第55行 `max_tokens: 8192` 限制了输出，DeepSeek V4 有 384K 输出能力，长文档会被截断
2. **P0-2**: mose/loop.ts 缺少 `reasoning_content` 回传，DeepSeek V4 thinking 模式会报 400 错误
3. **P0-3**: mose/loop.ts 缺少连接超时保护，网络异常时无限等待

### P1 — 重要（代码清理和统一）
4. **P1-1**: 删除空的 `work_files` 表、路由、前端引用（已被 agent_files/workspace_files 替代）
5. **P1-2**: 删除死代码 `mose/prompt.ts`（从未被调用，实际用的是 context.ts）
6. **P1-3**: 移除冗余 `use_skill` 工具（技能全文已在 system prompt 中预加载）
7. **P1-4**: vibe 引擎 `agent/loop.ts` 硬编码模型选择 + 传无效 `reasoning_effort` 参数

### P2 — 优化（体验和健壮性）
8. **P2-1**: agent 配置文件无变更追踪，添加 `agent_file_versions` 表
9. **P2-2**: `onStreamEnd` 可靠性 — SSE 异常断开时不触发，文件树不刷新
10. **P2-3**: `context.ts` workflow prompt 过度设计，简化 5 步工作流

## 范围

**仅修改 Work 模块**，不动 Coding/Market/Admin：
- `server/src/agent/mose/` — P0-1, P0-2, P0-3, P1-2, P1-3, P2-3
- `server/src/agent/loop.ts` — P1-4
- `server/src/routes/work/` — P1-1
- `server/src/defs/db_schema.ts`, `server/src/defs/index.ts` — P1-1, P2-1
- `server/src/routes/agents.ts` — P2-1
- `web/src/components/work/ChatPanel.tsx` — P2-2
- `web/src/components/work/AgentPanel.tsx` — P1-1
- `web/src/hooks/useFiles.ts`, `web/src/hooks/useActiveFile.ts` — P1-1
- `web/src/lib/file-api.ts` — P1-1

## 非目标

- 不改变 mose 引擎的核心循环逻辑
- 不调整 prompt 内容（P2-3 仅做简化）
- 不新增功能特性
