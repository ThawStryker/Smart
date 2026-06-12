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
3. 删除 `LoopParams` 中不再需要的 `baseURL`, `apiPath`, `apiKey`, `modelName` 字段（由调用方传入 `modelConfig`）

**注意**: vibe 引擎用于 Coding 页面，但 `loop.ts` 在 `agent/` 目录下。需检查调用方是否也需要更新。

## P2-1: agent_file_versions 表

**新增表**:
```sql
CREATE TABLE agent_file_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fileId INTEGER NOT NULL,
  path TEXT NOT NULL,
  content TEXT NOT NULL,
  createdAt TEXT DEFAULT (datetime('now'))
);
```

**实现**: 在 `agents.ts` 的 PUT `/agents/:name/files/:path` 路由中，每次更新 agent 文件时自动插入一条版本记录。

**决策**: 版本记录仅追加，不清理。存储成本可接受（文本文件很小）。

## P2-2: onStreamEnd 可靠性

**文件**: `web/src/components/work/ChatPanel.tsx`

当前 `onStreamEnd` 在 try-catch 的 finally 块中调用（第261行），正常流程没问题。但 SSE 连接异常断开时，`reader.read()` 的 `done` 事件可能不到达，导致 while 循环卡住。

**修复**: 添加 `useEffect` 监听 `streamActive` 从 true 变 false 时触发 `onStreamEnd` 回调。这样即使 streaming 被异常终止，也能确保回调执行。

```typescript
useEffect(() => {
  if (!streamActive) {
    onStreamEndRef.current?.();
  }
}, [streamActive]);
```

## P2-3: 简化 context.ts workflow prompt

**文件**: `server/src/agent/mose/context.ts:49-68`

当前 workflow 中有大量 "thinking channel" 相关指令（`CRITICAL: Use your thinking channel for ALL analysis`），这是用 prompt 解决引擎问题的反模式。

**简化后**:
1. 匹配 skill 格式
2. 检查信息完整性
3. 生成内容并 write_file 保存
4. 简短总结

去掉 thinking channel 强制指令，去掉 "visible output must be a SINGLE short paragraph" 等过度约束。
