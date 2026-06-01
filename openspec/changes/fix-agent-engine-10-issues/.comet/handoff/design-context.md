# Comet Design Handoff

- Change: fix-agent-engine-10-issues
- Phase: design
- Mode: compact
- Context hash: 10e08afd72864d0a8097ee61b2f75cc07554352662327a625e2becfbda547bb8

Generated-by: comet-handoff.sh

OpenSpec remains the canonical capability spec. This handoff is a deterministic, source-traceable context pack, not an agent-authored summary.

## openspec/changes/fix-agent-engine-10-issues/proposal.md

- Source: openspec/changes/fix-agent-engine-10-issues/proposal.md
- Lines: 1-44
- SHA256: 9a6e57aa3bbee7b9e9e187e3e6d16b77aee27be2f3e53250b312559acd755361

```md
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
```

## openspec/changes/fix-agent-engine-10-issues/design.md

- Source: openspec/changes/fix-agent-engine-10-issues/design.md
- Lines: 1-130
- SHA256: 6392e815bfc4033f1d7a553ded24fd3c97d9e1bd9878cf08ebab80151b59957a

[TRUNCATED]

```md
# Design: 修复 Agent 引擎 10 个问题

## P0-1: 去掉 max_tokens 限制

**文件**: `server/src/agent/mose/loop.ts:55`

移除 `max_tokens: 8192`，让模型自由输出。同时在 Yumi 直聊模式（第211行）也移除 `max_tokens: 4096`。

**决策**: 直接删除参数行。模型侧无限制，由模型自身决定何时停止。

## P0-2: 修复 reasoning_content 回传

**文件**: `server/src/agent/mose/loop.ts`

参照 vibe 引擎 `agent/loop.ts:65,103-104,140` 的做法：
1. 声明 `let reasoningContent = ""` 在循环外
2. SSE 解析中累积 `reasoningContent += delta.reasoning_content`
3. push assistant 消息时加上 `reasoning_content` 字段

**当前问题**: 第89-91行只 emit 了 thinking 事件，但未累积到变量。第130/135行 push assistant 时缺少 `reasoning_content`，DeepSeek V4 要求连续的 thinking 消息必须包含上一轮的 reasoning_content，否则 400 错误。

## P0-3: 连接超时保护

**文件**: `server/src/agent/mose/loop.ts`

在 fetch 前创建 `AbortController`，设置 30 秒连接超时：
```typescript
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 30000);
```
fetch 成功后清除 timeout。AbortError 时优雅退出循环。

**决策**: 仅连接超时 30 秒，streaming 期间不设超时（模型可能长时间思考）。

## P1-1: 删除 work_files 表和路由

**影响范围**:
1. `server/src/routes/work/files.ts` — 删除整个文件
2. `server/src/routes/work/index.ts` — 移除 `filesRoutes` 导入和 `.route("/sessions/:id/files", filesRoutes)`
3. `server/src/defs/db_schema.ts` — 删除 `workFiles` 表定义（第212-222行）
4. `server/src/defs/index.ts` — 从显式导出中移除 `workFiles`（第25行）
5. `server/src/routes/work/sessions.ts` — 移除 `workFiles` 导入（第5行）
6. `web/src/components/work/AgentPanel.tsx` — 移除 `/api/work/sessions/${sessionId}/files` 请求
7. `web/src/hooks/useFiles.ts` — 移除 session files 请求
8. `web/src/hooks/useActiveFile.ts` — 移除 session files fallback 逻辑
9. `web/src/lib/file-api.ts` — 移除 session files 路径的 API 函数
10. `web/src/test/hooks/useFiles.test.ts` — 更新测试
11. `web/src/test/hooks/useActiveFile.test.ts` — 更新测试

**安全约束**: 表是空的（0 行），删除安全。但按照项目规范，数据库 migration 不可逆 — 用 `edgespark db generate` 生成 migration 后 `edgespark db migrate`。

## P1-2: 删除死代码 mose/prompt.ts

**文件**: `server/src/agent/mose/prompt.ts`

`buildSystemPrompt()` 导出但从未被导入调用。实际使用的是 `context.ts` 的 `buildAgentSystemPrompt()`。

**决策**: 直接删除文件。无任何引用需要更新。

## P1-3: 移除冗余 use_skill 工具

**文件**: 
- `server/src/agent/mose/tools/index.ts` — 移除 AGENT_TOOLS 中的 use_skill 定义 + executeAgentTool 中的 use_skill case
- `server/src/agent/mose/tools/use-skill.ts` — 删除文件

技能全文已在 `context.ts:40-44` 预加载到 system prompt，use_skill 工具再从 DB 加载一遍是冗余的。且 doubao 模型不擅长主动调用 skill_view/use_skill，预加载方案更可靠。

## P1-4: vibe 引擎改用 models.ts

**文件**: `server/src/agent/loop.ts:34-43,49`

当前硬编码：
```typescript
// 第34-43行: 根据 selectedModel 手动判断 seed vs deepseek
// 第49行: reasoning_effort: "high" — OpenAI o1 参数，DeepSeek/Seed 都不支持
```

改为：
1. 从 `models.ts` 的 `getModel(selectedModel)` 读取 `baseURL`, `apiPath`, `apiKey`, `modelName`
2. 删除 `reasoning_effort: "high"` 参数
```

Full source: openspec/changes/fix-agent-engine-10-issues/design.md

## openspec/changes/fix-agent-engine-10-issues/tasks.md

- Source: openspec/changes/fix-agent-engine-10-issues/tasks.md
- Lines: 1-36
- SHA256: 605c76341f8b7607724bac0b3e0aeca0ff579a0f0713a2e00f55bd0830ce2e7c

```md
# Tasks: 修复 Agent 引擎 10 个问题

## P0 — 紧急

- [ ] **P0-1**: 去掉 mose/loop.ts 第55行 `max_tokens: 8192` 和第211行 `max_tokens: 4096`
- [ ] **P0-2**: 修复 mose/loop.ts reasoning_content 回传 — 声明变量、SSE 中累积、push assistant 时附加
- [ ] **P0-3**: mose/loop.ts 添加 AbortController + 30 秒连接超时保护

## P1 — 重要

- [ ] **P1-1a**: 删除 `server/src/routes/work/files.ts`
- [ ] **P1-1b**: 从 `server/src/routes/work/index.ts` 移除 filesRoutes
- [ ] **P1-1c**: 从 `server/src/defs/db_schema.ts` 删除 workFiles 表定义
- [ ] **P1-1d**: 从 `server/src/defs/index.ts` 移除 workFiles 显式导出
- [ ] **P1-1e**: 从 `server/src/routes/work/sessions.ts` 移除 workFiles 导入
- [ ] **P1-1f**: 生成并应用数据库 migration
- [ ] **P1-1g**: 前端移除 session files 请求和 fallback 逻辑
- [ ] **P1-2**: 删除死代码 `server/src/agent/mose/prompt.ts`
- [ ] **P1-3a**: 从 tools/index.ts AGENT_TOOLS 中移除 use_skill 工具定义
- [ ] **P1-3b**: 从 tools/index.ts executeAgentTool 中移除 use_skill case + 删除 use-skill.ts
- [ ] **P1-4**: vibe 引擎 agent/loop.ts 改用 models.ts 读取模型配置 + 去掉 reasoning_effort

## P2 — 优化

- [ ] **P2-1a**: 在 db_schema.ts 添加 agent_file_versions 表定义
- [ ] **P2-1b**: 在 defs/index.ts 导出新表
- [ ] **P2-1c**: 在 agents.ts PUT 路由中实现版本记录插入
- [ ] **P2-1d**: 生成并应用数据库 migration
- [ ] **P2-2**: ChatPanel.tsx 添加 useEffect 监听 streamActive → false 触发 onStreamEnd
- [ ] **P2-3**: 简化 context.ts workflow prompt（去掉 thinking channel 强制指令）

## 验证

- [ ] `git diff` 验证改动范围仅限 Work 模块
- [ ] `npm run typecheck` 通过（server + web）
- [ ] `edgespark deploy` 部署成功
```

