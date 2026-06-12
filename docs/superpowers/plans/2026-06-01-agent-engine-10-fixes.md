---
change: fix-agent-engine-10-issues
design-doc: docs/superpowers/specs/2026-06-01-agent-engine-10-fixes-design.md
base-ref: 47f9089486ef509bde3f4ab1bca2feb2c6ab6d3a
---

# Agent 引擎 10 问题修复 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 agent 引擎的 10 个已知问题，覆盖 mose 引擎、vibe 引擎、代码清理和前端可靠性。

**Architecture:** 按 P0 → P1 → P2 顺序执行，同文件改动合并，migration 独立处理。每批改动后 typecheck 验证。

**Tech Stack:** TypeScript, Hono, Drizzle ORM, React

---

## Task 1: P0 — mose/loop.ts 三合一修复

**Files:**
- Modify: `server/src/agent/mose/loop.ts`

### P0-1: 去掉 max_tokens

- [ ] **Step 1: 删除第55行 `max_tokens: 8192,` 和第211行 `max_tokens: 4096,`**

```typescript
// 第49-57行改为（去掉 max_tokens 行）:
body: JSON.stringify({
  model: modelConfig.modelName,
  messages,
  tools: AGENT_TOOLS,
  tool_choice: "auto",
  temperature: 0.5,
  stream: true,
}),

// 第207-213行改为（去掉 max_tokens 行）:
body: JSON.stringify({
  model: modelConfig.modelName,
  messages,
  temperature: 0.5,
  stream: true,
}),
```

### P0-2: reasoning_content 回传

- [ ] **Step 2: 在第68行后声明 `let reasoningContent = "";`**

```typescript
let textContent = "";
let reasoningContent = "";  // 新增
```

- [ ] **Step 3: 修改第89-91行，SSE 中累积 reasoningContent**

```typescript
if (delta?.reasoning_content) {
  reasoningContent += delta.reasoning_content;
  emit(eventQueue, { type: "thinking", delta: delta.reasoning_content });
}
```

- [ ] **Step 4: 修改第130-131行和第135-143行，push assistant 时附加 reasoning_content**

第130-131行（无 tool_calls 的情况）改为:
```typescript
const assistantMsg: Record<string, unknown> = { role: "assistant", content: textContent };
if (reasoningContent) assistantMsg.reasoning_content = reasoningContent;
messages.push(assistantMsg);
```

第135-143行（有 tool_calls 的情况）改为:
```typescript
const assistantMsg: Record<string, unknown> = {
  role: "assistant",
  content: textContent || "",
  tool_calls: toolCalls.map((tc) => ({
    id: tc.id,
    type: "function",
    function: { name: tc.function.name, arguments: tc.function.arguments },
  })),
};
if (reasoningContent) assistantMsg.reasoning_content = reasoningContent;
messages.push(assistantMsg);
```

### P0-3: 连接超时保护

- [ ] **Step 5: 在第43行 fetch 前添加 AbortController + 30s 超时**

```typescript
// 第42行 for 循环内，第43行 fetch 前插入:
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 30000);
```

- [ ] **Step 6: 第43行 fetch 添加 signal 参数，第48行后添加 signal**

```typescript
body: JSON.stringify({...}),
signal: controller.signal,  // 新增
```

- [ ] **Step 7: 第60行 res.ok 检查后清除 timeout**

```typescript
if (!res.ok || !res.body) {
  clearTimeout(timeoutId);  // 新增
  emit(eventQueue, { type: "error", message: `API error: ${res.status}` });
  break;
}
clearTimeout(timeoutId);  // 新增 (紧接在 if 块后)
```

- [ ] **Step 8: 在 catch 块中处理 AbortError（当前无 try-catch 包裹 fetch，需添加）**

在第42行 for 循环开始处包裹 try-catch:
```typescript
try {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);
  const res = await fetch(...);
  // ... existing code ...
} catch (err: unknown) {
  if (err instanceof DOMException && err.name === "AbortError") {
    emit(eventQueue, { type: "error", message: "Request timeout after 30s" });
  } else {
    emit(eventQueue, { type: "error", message: `Request error: ${err instanceof Error ? err.message : String(err)}` });
  }
  break;
}
```

**注意**: 需要调整现有的 if/break 结构 — 将 fetch 调用和 SSE 解析包裹在 try-catch 中。

- [ ] **Step 9: 同样为 Yumi 直聊模式（第201-214行）添加超时保护**

在第201行 fetch 前添加同样的 controller + timeout 逻辑。

- [ ] **Step 10: 提交**

```bash
git add server/src/agent/mose/loop.ts
git commit -m "fix(mose): remove max_tokens limit, add reasoning_content passthrough, add 30s connection timeout"
```

---

## Task 2: P1-2 — 删除死代码 mose/prompt.ts

**Files:**
- Delete: `server/src/agent/mose/prompt.ts`

- [ ] **Step 1: 删除文件**

```bash
rm server/src/agent/mose/prompt.ts
```

- [ ] **Step 2: 验证无引用**

```bash
grep -rn "prompt" server/src/agent/mose/ --include="*.ts" | grep -v context.ts | grep -v node_modules
```

预期: 无输出（无其他文件引用 prompt.ts）。

- [ ] **Step 3: 提交**

```bash
git add server/src/agent/mose/prompt.ts
git commit -m "chore(mose): remove dead code prompt.ts (never called, context.ts is used instead)"
```

---

## Task 3: P1-3 — 移除冗余 use_skill 工具

**Files:**
- Modify: `server/src/agent/mose/tools/index.ts`
- Delete: `server/src/agent/mose/tools/use-skill.ts`

- [ ] **Step 1: 从 tools/index.ts 第4行删除 useSkill 导入**

```typescript
// 删除: import { useSkill } from "./use-skill";
```

- [ ] **Step 2: 从 executeAgentTool switch 第21行删除 use_skill case**

删除:
```typescript
case "use_skill": return useSkill(args, params.userId, params.targetAgent);
```

- [ ] **Step 3: 从 AGENT_TOOLS 数组删除 use_skill 工具定义（第85-98行）**

删除整个:
```typescript
{
  type: "function" as const,
  function: {
    name: "use_skill",
    ...
  },
},
```

- [ ] **Step 4: 删除 use-skill.ts 文件**

```bash
rm server/src/agent/mose/tools/use-skill.ts
```

- [ ] **Step 5: 提交**

```bash
git add server/src/agent/mose/tools/index.ts server/src/agent/mose/tools/use-skill.ts
git commit -m "chore(mose): remove redundant use_skill tool (skills pre-loaded in system prompt)"
```

---

## Task 4: P2-3 — 简化 context.ts workflow prompt

**Files:**
- Modify: `server/src/agent/mose/context.ts`

- [ ] **Step 1: 替换第49-68行的 workflow 段**

将:
```
## Agent Workflow
You operate in a structured 5-step workflow...
**CRITICAL: Use your thinking channel for ALL analysis...**
...
```

替换为:
```typescript
parts.push(`## Agent Workflow

Follow these steps for every task:

### Step 1: SKILL MATCH
Check the Skills section above. If a skill matches the task, follow its template, format, and requirements EXACTLY. The skill defines the output structure.

### Step 2: INFORMATION CHECK
Verify you have all necessary information. If critical details are missing (topic, audience, goals, format), ask the user before proceeding.

### Step 3: CONTENT GENERATION
Generate the complete document following the selected format. Then use write_file to save it to workspace/<filename>.md.

### Step 4: SUMMARIZE
Output a brief completion summary (2-3 sentences): what was created, document structure, where it's saved. Do NOT repeat the document content.`);
```

- [ ] **Step 2: 提交**

```bash
git add server/src/agent/mose/context.ts
git commit -m "refactor(mose): simplify workflow prompt, remove thinking-channel overdesign"
```

---

## Task 5: P1-4 — 去掉 vibe 引擎 reasoning_effort

**Files:**
- Modify: `server/src/agent/loop.ts`

- [ ] **Step 1: 删除第49行 `reasoning_effort: "high",`**

```typescript
// 第41-50行改为:
body: JSON.stringify({
  model: modelName,
  messages: currentMessages,
  tools: activeTools,
  tool_choice: "auto",
  temperature: 0.5,
  max_tokens: 8192,
  stream: true,
}),
```

- [ ] **Step 2: 提交**

```bash
git add server/src/agent/loop.ts
git commit -m "fix(agent): remove invalid reasoning_effort parameter (OpenAI o1-only, not supported by DeepSeek/Seed)"
```

---

## Task 6: P1-1 — 删除 work_files 表和路由

**Files:**
- Delete: `server/src/routes/work/files.ts`
- Modify: `server/src/routes/work/index.ts`
- Modify: `server/src/routes/work/sessions.ts`
- Modify: `server/src/defs/db_schema.ts`
- Modify: `server/src/defs/index.ts`
- Modify: `web/src/components/work/AgentPanel.tsx`
- Modify: `web/src/hooks/useFiles.ts`
- Modify: `web/src/hooks/useActiveFile.ts`
- Modify: `web/src/lib/file-api.ts`

### 服务端改动

- [ ] **Step 1: 删除 `server/src/routes/work/files.ts`**

```bash
rm server/src/routes/work/files.ts
```

- [ ] **Step 2: 修改 `server/src/routes/work/index.ts`**

删除第3行 `import { filesRoutes } from "./files";` 和第10行 `.route("/sessions/:id/files", filesRoutes)`:

```typescript
import { Hono } from "hono";
import { sessionsRoutes } from "./sessions";
import { messagesRoutes } from "./messages";
import { chatRoutes } from "./chat";
import { workspaceRoutes } from "./workspace";

export const workRoutes = new Hono()
  .route("/sessions", sessionsRoutes)
  .route("/sessions/:id/messages", messagesRoutes)
  .route("/chat", chatRoutes)
  .route("/workspace", workspaceRoutes);
```

- [ ] **Step 3: 修改 `server/src/routes/work/sessions.ts` 第5行**

```typescript
// 改为:
import { workSessions, workMessages } from "@defs";
```

- [ ] **Step 4: 从 `server/src/defs/db_schema.ts` 删除 workFiles 表定义（第212-222行）**

删除:
```typescript
export const workFiles = sqliteTable("work_files", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sessionId: integer("session_id").notNull(),
  path: text("path").notNull(),
  content: text("content").default(""),
  isFolder: integer("is_folder").default(0),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").default(sql`(datetime('now'))`),
}, (table) => ({
  sessionPathUnique: uniqueIndex("work_files_session_path_unique").on(table.sessionId, table.path),
}));
```

- [ ] **Step 5: 修改 `server/src/defs/index.ts` 第25行**

```typescript
// 改为:
export { workSessions, workMessages, agentFiles, workspaceFiles, userAgents } from "./db_schema";
```

### 前端改动

- [ ] **Step 6: 修改 `web/src/components/work/AgentPanel.tsx` 第52行**

```typescript
// 删除 session files fetch，只保留 workspace fetch:
const [workspaceRes] = await Promise.all([
  fetch(`/api/work/workspace`).catch(() => ({ ok: false } as Response)),
]);
```

- [ ] **Step 7: 修改 `web/src/hooks/useFiles.ts` 第27行**

```typescript
// 删除 session files fetch:
const res = await fetch(`/api/work/workspace`);
```

- [ ] **Step 8: 修改 `web/src/hooks/useActiveFile.ts` 第25行和第82行**

移除 session files 路径的 fallback 逻辑，只保留 workspace 路径:
```typescript
// 第25行改为:
const url = `/api/work/workspace/${apiPath.split("/").map(encodeURIComponent).join("/")}`;

// 第82行改为:
url = `/api/work/workspace/${path.split("/").map(encodeURIComponent).join("/")}`;
```

- [ ] **Step 9: 修改 `web/src/lib/file-api.ts`**

删除 session files 相关的函数（`getSessionFilePath`, `saveSessionFile` 等），只保留 workspace API。

### Migration

- [ ] **Step 10: 生成 migration**

```bash
cd server && npx drizzle-kit generate
```

- [ ] **Step 11: 应用 migration**

```bash
cd /Users/cuitao/Documents/Smart && edgespark db migrate
```

- [ ] **Step 12: 提交**

```bash
git add server/src/routes/work/files.ts server/src/routes/work/index.ts server/src/routes/work/sessions.ts server/src/defs/db_schema.ts server/src/defs/index.ts web/src/components/work/AgentPanel.tsx web/src/hooks/useFiles.ts web/src/hooks/useActiveFile.ts web/src/lib/file-api.ts drizzle/
git commit -m "chore: remove empty work_files table, routes, and frontend references"
```

---

## Task 7: P2-1 — agent_file_versions 表

**Files:**
- Modify: `server/src/defs/db_schema.ts`
- Modify: `server/src/defs/index.ts`
- Modify: `server/src/routes/agents.ts`

- [ ] **Step 1: 在 `db_schema.ts` 末尾（第275行后）添加表定义**

```typescript
export const agentFileVersions = sqliteTable("agent_file_versions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  fileId: integer("file_id").notNull(),
  path: text("path").notNull(),
  content: text("content").notNull(),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
});
```

- [ ] **Step 2: 在 `defs/index.ts` 第25行添加导出**

```typescript
export { workSessions, workMessages, agentFiles, workspaceFiles, userAgents, agentFileVersions } from "./db_schema";
```

- [ ] **Step 3: 在 `agents.ts` 第5行添加导入**

```typescript
import { userAgents, agentFiles, agentFileVersions } from "@defs";
```

- [ ] **Step 4: 在 `agents.ts` PUT `/:name/files/:path` 路由中插入版本记录**

在第170-174行（existing 的 update 分支）后插入:
```typescript
if (existing) {
  await db.update(agentFiles).set({...}).where(eq(agentFiles.id, existing.id));
  // 插入版本记录
  await db.insert(agentFileVersions).values({
    fileId: existing.id,
    path: filePath,
    content: existing.content,
  });
}
```

- [ ] **Step 5: 生成 migration**

```bash
cd server && npx drizzle-kit generate
```

- [ ] **Step 6: 应用 migration**

```bash
cd /Users/cuitao/Documents/Smart && edgespark db migrate
```

- [ ] **Step 7: 提交**

```bash
git add server/src/defs/db_schema.ts server/src/defs/index.ts server/src/routes/agents.ts drizzle/
git commit -m "feat: add agent_file_versions table for change tracking"
```

---

## Task 8: P2-2 — onStreamEnd 可靠性

**Files:**
- Modify: `web/src/components/work/ChatPanel.tsx`

- [ ] **Step 1: 在 ChatPanel 组件中添加 onStreamEndRef 和 useEffect**

在第92行 `const [streamActive, setStreamActive] = useState(false);` 后添加:

```typescript
const onStreamEndRef = useRef(onStreamEnd);
onStreamEndRef.current = onStreamEnd;
```

- [ ] **Step 2: 添加 useEffect 监听 streamActive 变化**

在第142行 `useEffect(() => { if (sessionId) loadMessages(true); }, [sessionId, loadMessages]);` 后添加:

```typescript
useEffect(() => {
  if (!streamActive) {
    onStreamEndRef.current?.();
  }
}, [streamActive]);
```

**注意**: 这个 useEffect 会在组件挂载时也触发（streamActive 初始为 false）。使用一个 flag 防止首次挂载触发:

```typescript
const mountedRef = useRef(false);
useEffect(() => {
  if (!mountedRef.current) {
    mountedRef.current = true;
    return;
  }
  if (!streamActive) {
    onStreamEndRef.current?.();
  }
}, [streamActive]);
```

或者更简单: 保持现有的 try-catch finally 中的 onStreamEnd 调用（正常路径），新增 useEffect 作为异常路径的兜底。由于 `onStreamEnd` 在 WorkPage 中是幂等的（`setReloadCounter(c => c + 1)` 和 `save`），重复调用也安全。

- [ ] **Step 3: 提交**

```bash
git add web/src/components/work/ChatPanel.tsx
git commit -m "fix(chat): ensure onStreamEnd fires on abnormal SSE disconnect via useEffect fallback"
```

---

## 验证

- [ ] **Step V1: Server typecheck**

```bash
cd server && npm run typecheck
```

- [ ] **Step V2: Web typecheck**

```bash
cd web && npm run typecheck
```

- [ ] **Step V3: 验证改动范围**

```bash
git diff --stat base-ref..
```

确认仅 Work 模块文件被修改。

- [ ] **Step V4: 部署**

```bash
cd /Users/cuitao/Documents/Smart && edgespark deploy
```
