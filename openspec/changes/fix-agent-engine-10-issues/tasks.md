# Tasks: 修复 Agent 引擎 10 个问题

## P0 — 紧急

- [x] **P0-1**: 去掉 mose/loop.ts 第55行 `max_tokens: 8192` 和第211行 `max_tokens: 4096`
- [x] **P0-2**: 修复 mose/loop.ts reasoning_content 回传 — 声明变量、SSE 中累积、push assistant 时附加
- [x] **P0-3**: mose/loop.ts 添加 AbortController + 30 秒连接超时保护

## P1 — 重要

- [x] **P1-1a**: 删除 `server/src/routes/work/files.ts`
- [x] **P1-1b**: 从 `server/src/routes/work/index.ts` 移除 filesRoutes
- [x] **P1-1c**: 从 `server/src/defs/db_schema.ts` 删除 workFiles 表定义
- [x] **P1-1d**: 从 `server/src/defs/index.ts` 移除 workFiles 显式导出
- [x] **P1-1e**: 从 `server/src/routes/work/sessions.ts` 移除 workFiles 导入
- [x] **P1-1f**: 生成并应用数据库 migration
- [x] **P1-1g**: 前端移除 session files 请求和 fallback 逻辑
- [x] **P1-2**: 删除死代码 `server/src/agent/mose/prompt.ts`
- [x] **P1-3a**: 从 tools/index.ts AGENT_TOOLS 中移除 use_skill 工具定义
- [x] **P1-3b**: 从 tools/index.ts executeAgentTool 中移除 use_skill case + 删除 use-skill.ts
- [x] **P1-4**: vibe 引擎 agent/loop.ts 去掉 reasoning_effort 参数

## P2 — 优化

- [x] **P2-1a**: 在 db_schema.ts 添加 agent_file_versions 表定义
- [x] **P2-1b**: 在 defs/index.ts 导出新表
- [x] **P2-1c**: 在 agents.ts PUT 路由中实现版本记录插入
- [x] **P2-1d**: 生成并应用数据库 migration
- [x] **P2-2**: ChatPanel.tsx 添加 useEffect 监听 streamActive → false 触发 onStreamEnd
- [x] **P2-3**: 简化 context.ts workflow prompt（去掉 thinking channel 强制指令）

## 验证

- [x] `git diff` 验证改动范围仅限 Work 模块
- [x] `npm run typecheck` 通过（server + web）
- [x] `edgespark deploy` 部署成功
