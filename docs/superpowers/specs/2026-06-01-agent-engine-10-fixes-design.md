---
comet_change: fix-agent-engine-10-issues
role: technical-design
canonical_spec: openspec
---

# Agent 引擎 10 问题修复 — 技术设计

## 概述

15 个文件的精准修复，按 P0 → P1 → P2 顺序执行。全部在 Work 模块范围内。

## P0 — 紧急修复 (mose/loop.ts)

### P0-1: 去掉 max_tokens

**当前**: 第55行 `max_tokens: 8192`，第211行 `max_tokens: 4096`
**改为**: 删除这两行。DeepSeek V4 有 384K 输出能力，不应限制。

### P0-2: reasoning_content 回传

**当前**: 第89-91行仅 emit thinking 事件，未累积变量。第130/135行 push assistant 时缺少 reasoning_content 字段。

**改为** (参照 vibe 引擎 `agent/loop.ts:65,103-104,140`):
```typescript
let reasoningContent = "";  // 在循环外声明

// SSE 解析中累积
if (delta?.reasoning_content) {
  reasoningContent += delta.reasoning_content;
  emit(eventQueue, { type: "thinking", delta: delta.reasoning_content });
}

// push assistant 时附加
messages.push({
  role: "assistant",
  content: textContent || "",
  ...(reasoningContent ? { reasoning_content: reasoningContent } : {}),
  tool_calls: [...],
});
```

### P0-3: 连接超时

在 fetch 前创建 AbortController + 30s 超时：
```typescript
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 30000);
// fetch 中加 signal: controller.signal
// res.ok 后 clearTimeout(timeoutId)
// catch AbortError 时优雅退出
```

## P1 — 代码清理

### P1-1: 删除 work_files

删除文件: `server/src/routes/work/files.ts`
修改文件:
- `work/index.ts` — 移除 filesRoutes 导入和路由
- `work/sessions.ts` — 移除 workFiles 导入
- `defs/db_schema.ts` — 删除 workFiles 表定义 (第212-222行)
- `defs/index.ts` — 从显式导出移除 workFiles (第25行)
- 前端: AgentPanel.tsx, useFiles.ts, useActiveFile.ts, file-api.ts

Migration: `edgespark db generate` → `edgespark db migrate` 删除 work_files 表。

### P1-2: 删除 mose/prompt.ts

直接删除文件。`buildSystemPrompt()` 导出从未被导入调用，实际使用 `context.ts` 的 `buildAgentSystemPrompt()`。

### P1-3: 移除 use_skill

- 从 `tools/index.ts` AGENT_TOOLS 数组删除 use_skill 定义 (第85-98行)
- 从 executeAgentTool switch 删除 use_skill case (第21行)
- 删除 `tools/use-skill.ts` 文件

### P1-4: 去掉 reasoning_effort

**文件**: `server/src/agent/loop.ts:49`
删除 `reasoning_effort: "high"` 行。这是 OpenAI o1 参数，DeepSeek 和 Seed 都不支持。

## P2 — 优化

### P2-1: agent_file_versions 表

**新增表** (`defs/db_schema.ts`):
```typescript
export const agentFileVersions = sqliteTable("agent_file_versions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  fileId: integer("file_id").notNull(),
  path: text("path").notNull(),
  content: text("content").notNull(),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
});
```

**实现** (`routes/agents.ts` PUT `/:name/files/:path`):
```typescript
// 在 update 或 insert agentFiles 后，插入版本记录
if (existing) {
  await db.insert(agentFileVersions).values({
    fileId: existing.id,
    path: filePath,
    content: existing.content,
  });
}
```

### P2-2: onStreamEnd 可靠性

**文件**: `web/src/components/work/ChatPanel.tsx`

添加 useEffect 监听 streamActive 变化:
```typescript
const onStreamEndRef = useRef(onStreamEnd);
onStreamEndRef.current = onStreamEnd;

useEffect(() => {
  if (!streamActive) {
    onStreamEndRef.current?.();
  }
}, [streamActive]);
```

保留现有的 try-catch finally 中的 onStreamEnd 调用（正常路径），新增的 useEffect 作为兜底（异常路径）。用 ref 避免闭包过期问题。

### P2-3: 简化 workflow prompt

**文件**: `server/src/agent/mose/context.ts:49-68`

去掉 thinking channel 强制指令，简化为 4 步:
1. 匹配 skill 格式
2. 检查信息完整性
3. 生成内容并 write_file 保存
4. 简短总结

## 执行顺序

```
P0-1 + P0-2 + P0-3  (mose/loop.ts 同文件，一次性改完)
  → P1-2 (删除文件)
  → P1-3 (tools 清理)
  → P2-3 (context.ts workflow)
  → P1-4 (agent/loop.ts 去参数)
  → P1-1 (work_files 全链路，含 migration)
  → P2-1 (新表 + migration)
  → P2-2 (前端 ChatPanel)
```

## 验证

1. `npm run typecheck` — server + web
2. `git diff --stat` 确认仅 Work 模块文件
3. `edgespark deploy`
