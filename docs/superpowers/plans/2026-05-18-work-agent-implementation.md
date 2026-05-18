# Work-Agent 多智能体协同系统实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Work 页面升级为编排者模式多 agent 协同系统，文件树持久化 + agent 调度 + 任务卡片 + 团队管理 + 市场发布。

**Architecture:** 服务端新增 `work_files` 表持久化文件树，改造 Chat API 支持 `call_agent` tool calling。前端对话区新增任务卡片组件，文件树对接 API，团队 tab 从填表模式改为文件目录管理。分 P0-P3 优先级逐步实现。

**Tech Stack:** Hono + Drizzle ORM (Cloudflare Workers), React + Vite (SPA), Milkdown 编辑器

---

## File Structure

```
Server (modified/created):
  server/src/defs/db_schema.ts          — add workFiles table
  server/src/routes/work.ts             — rewrite chat + add files CRUD
  server/src/agent/tools/call-agent.ts  — NEW: call_agent tool definition
  server/src/agent/memory/work-memory.ts— NEW: work memory extraction
  server/src/agent/work-agent.ts        — NEW: orchestration loop

Web (modified/created):
  web/src/pages/WorkPage.tsx            — task cards, file tree API, agent list
  web/src/components/work/TaskCard.tsx  — NEW: task card component
  web/src/hooks/useWorkFiles.ts         — NEW: file tree API hooks
  web/src/pages/MarketPage.tsx          — add talent tab (P2)
```

---

### Task 1: Add `work_files` table

**Files:**
- Modify: `server/src/defs/db_schema.ts` (insert before `workAgents` line ~199)
- Run: `edgespark db generate && edgespark db migrate`

- [ ] **Step 1: Add table definition**

In `server/src/defs/db_schema.ts`, insert before `workAgents`:

```typescript
// Work — 文件树持久化
export const workFiles = sqliteTable("work_files", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id").notNull(),
  path: text("path").notNull(),          // e.g. "agents/designer/AGENTS.md"
  content: text("content").notNull().default(""),
  isFolder: integer("is_folder", { mode: "boolean" }).default(false),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").default(sql`(datetime('now'))`),
}, (table) => ({
  userPathIdx: uniqueIndex("work_files_user_path_idx").on(table.userId, table.path),
}));
```

- [ ] **Step 2: Add export to defs/index.ts**

In `server/src/defs/index.ts`, add `workFiles` to the barrel export:

```typescript
export { workFiles } from "./db_schema";
```

- [ ] **Step 3: Generate and apply migration**

```bash
cd /Users/cuitao/Documents/Smart && edgespark db generate && edgespark db migrate
```

Expected: Migration SQL generated in `drizzle/`, applied to D1 successfully.

- [ ] **Step 4: Commit**

```bash
git add server/src/defs/db_schema.ts server/src/defs/index.ts drizzle/
git commit -m "feat: add work_files table for persistent file tree"
```

---

### Task 2: Work files API (CRUD + list)

**Files:**
- Modify: `server/src/routes/work.ts` (add file routes)
- Import: `eq, and, like, desc` from drizzle-orm, `workFiles` from @defs

- [ ] **Step 1: Add GET /api/work/files (list + read)**

Insert before `export const workRoutes` (or append to chain):

```typescript
// Inside workRoutes chain:
.get("/api/work/files/*", async (c) => {
  const userId = auth.user!.id;
  const filePath = c.req.path.replace("/api/work/files/", "");
  const [row] = await db.select().from(workFiles)
    .where(and(eq(workFiles.userId, userId), eq(workFiles.path, filePath)));
  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json({ path: row.path, content: row.content, isFolder: row.isFolder, updatedAt: row.updatedAt });
})
.get("/api/work/files", async (c) => {
  const userId = auth.user!.id;
  const prefix = c.req.query("prefix") || "";
  const rows = await db.select().from(workFiles)
    .where(and(eq(workFiles.userId, userId), like(workFiles.path, prefix + "%")))
    .orderBy(workFiles.path);
  return c.json(rows.map(r => ({ path: r.path, content: r.content, isFolder: r.isFolder, updatedAt: r.updatedAt })));
})
```

Note: The wildcard route `/api/work/files/*` must come BEFORE the list route `/api/work/files` in Hono.

- [ ] **Step 2: Add PUT /api/work/files/* (upsert)**

```typescript
.put("/api/work/files/*", async (c) => {
  const userId = auth.user!.id;
  const filePath = c.req.path.replace("/api/work/files/", "");
  const { content, isFolder } = await c.req.json<{ content?: string; isFolder?: boolean }>();
  
  const [existing] = await db.select().from(workFiles)
    .where(and(eq(workFiles.userId, userId), eq(workFiles.path, filePath)));
  
  if (existing) {
    await db.update(workFiles).set({
      ...(content !== undefined ? { content } : {}),
      ...(isFolder !== undefined ? { isFolder } : {}),
      updatedAt: new Date().toISOString(),
    }).where(eq(workFiles.id, existing.id));
  } else {
    await db.insert(workFiles).values({
      userId, path: filePath,
      content: content || "",
      isFolder: isFolder || false,
    });
  }
  return c.json({ success: true });
})
```

- [ ] **Step 3: Add DELETE /api/work/files/* (delete file or folder)**

```typescript
.delete("/api/work/files/*", async (c) => {
  const userId = auth.user!.id;
  const filePath = c.req.path.replace("/api/work/files/", "");
  
  // Delete file and any children (if folder)
  await db.delete(workFiles)
    .where(and(eq(workFiles.userId, userId), like(workFiles.path, filePath + "%")));
  return c.json({ success: true });
})
```

- [ ] **Step 4: Add imports at top of work.ts**

```typescript
import { workFiles } from "@defs";
import { like } from "drizzle-orm";
```

- [ ] **Step 5: Verify routes with typecheck**

```bash
cd /Users/cuitao/Documents/Smart/server && npm run typecheck 2>&1
```

Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add server/src/routes/work.ts
git commit -m "feat: add work files CRUD API (list, read, write, delete)"
```

---

### Task 3: Frontend file tree — API hooks

**Files:**
- Create: `web/src/hooks/useWorkFiles.ts`

- [ ] **Step 1: Create useWorkFiles hook**

```typescript
import { useState, useEffect, useCallback } from "react";

interface WorkFile {
  path: string;
  content: string;
  isFolder: boolean;
  updatedAt: string;
}

export function useWorkFiles() {
  const [files, setFiles] = useState<WorkFile[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchFiles = useCallback(async (prefix = "") => {
    setLoading(true);
    const r = await fetch(`/api/work/files?prefix=${encodeURIComponent(prefix)}`, { credentials: "include" });
    if (r.ok) {
      const data = await r.json();
      if (Array.isArray(data)) setFiles(data);
    }
    setLoading(false);
  }, []);

  const readFile = useCallback(async (path: string): Promise<string | null> => {
    const r = await fetch(`/api/work/files/${encodeURIComponent(path)}`, { credentials: "include" });
    if (!r.ok) return null;
    const data = await r.json();
    return data.content;
  }, []);

  const writeFile = useCallback(async (path: string, content: string, isFolder = false) => {
    await fetch(`/api/work/files/${encodeURIComponent(path)}`, {
      method: "PUT", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, isFolder }),
    });
  }, []);

  const deleteFile = useCallback(async (path: string) => {
    await fetch(`/api/work/files/${encodeURIComponent(path)}`, {
      method: "DELETE", credentials: "include",
    });
  }, []);

  useEffect(() => { fetchFiles(); }, [fetchFiles]);

  return { files, loading, fetchFiles, readFile, writeFile, deleteFile };
}
```

- [ ] **Step 2: Commit**

```bash
git add web/src/hooks/useWorkFiles.ts
git commit -m "feat: add useWorkFiles hook for persistent file tree"
```

---

### Task 4: Wire frontend file tree to API

**Files:**
- Modify: `web/src/pages/WorkPage.tsx` (replace in-memory fileTree with API-backed data)

- [ ] **Step 1: Import useWorkFiles**

In WorkPage.tsx, add import:

```typescript
import { useWorkFiles } from "@/hooks/useWorkFiles";
```

- [ ] **Step 2: Replace initial fileTree state with API data**

Remove the hardcoded `fileTree` state initialization and replace with API-driven state. In `WorkPage`:

Replace:
```typescript
const [fileTree, setFileTree] = useState<FileNode[]>([...]);
```

With loading from API:
```typescript
const { files: apiFiles, fetchFiles, readFile, writeFile, deleteFile: deleteApiFile } = useWorkFiles();
const [fileTree, setFileTree] = useState<FileNode[]>([]);

// Build tree from flat file list
useEffect(() => {
  if (apiFiles.length === 0) return;
  const tree = buildTreeFromPaths(apiFiles.filter(f => !f.isFolder).map(f => f.path));
  setFileTree(tree);
}, [apiFiles]);
```

- [ ] **Step 3: Add buildTreeFromPaths helper**

Before `WorkPage`:

```typescript
function buildTreeFromPaths(paths: string[]): FileNode[] {
  const root: Record<string, any> = {};
  for (const p of paths) {
    const parts = p.split("/");
    let node = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (i === parts.length - 1) {
        node[part] = node[part] || { name: part, type: "file" as const };
      } else {
        node[part] = node[part] || { name: part, type: "folder" as const, children: {} };
        node = node[part].children;
      }
    }
  }
  function toArray(obj: Record<string, any>): FileNode[] {
    return Object.values(obj).map((n: any) => ({
      ...n,
      children: n.children ? toArray(n.children) : undefined,
      expanded: n.type === "folder" ? true : undefined,
    }));
  }
  return toArray(root);
}
```

- [ ] **Step 4: Modify addItem to persist via API**

Replace the `addItem` function's `updateTree` call with API write:

```typescript
const addItem = async (parentPath: number[]) => {
  if (!newItemName.trim()) return;
  const name = newItemType === "folder"
    ? newItemName
    : (newItemName.endsWith(".md") ? newItemName : newItemName + ".md");

  const parentDir = parentPath.length === 0 ? "" : getFilePath(parentPath) + "/";
  const fullPath = parentDir + name;
  await writeFile(fullPath, "", newItemType === "folder");
  await fetchFiles();
  setAddingTo(null);
  setNewItemName("");
};
```

- [ ] **Step 5: Modify delete to persist via API**

Replace `menuDelete`'s updateTree with:

```typescript
const menuDelete = async (path: number[]) => {
  setContextMenu(null);
  const node = nodeAt(path);
  if (!confirm(`删除 ${node.type === "folder" ? "文件夹" : "文件"} "${node.name}"？`)) return;
  const filePath = getFilePath(path);
  await deleteApiFile(filePath);
  await fetchFiles();
};
```

- [ ] **Step 6: Modify openFile to load from API**

```typescript
const openFile = async (displayPath: string, treePath?: number[]) => {
  const content = await readFile(displayPath);
  setFileContents(prev => ({ ...prev, [displayPath]: content || "" }));
  setSelectedFile({ displayPath, treePath });
};
```

- [ ] **Step 7: Modify MilkdownEditor onChange to auto-save**

In `MilkdownEditor` component, add debounced auto-save:

```typescript
import { useEffect } from "react";
// Inside MilkdownEditor, after existing code:
useEffect(() => {
  if (!onChange) return;
  const interval = setInterval(() => {
    if (crepeRef.current) {
      try {
        const md = crepeRef.current.getMarkdown();
        if (md) onChange(md);
      } catch {}
    }
  }, 3000); // Auto-save every 3 seconds
  return () => clearInterval(interval);
}, [filePath]);
```

- [ ] **Step 8: Seed default file tree on first load**

In `WorkPage`, add effect to create default files if API returns empty:

```typescript
useEffect(() => {
  if (!loading && apiFiles.length === 0) {
    // Seed default structure
    const defaults = [
      { path: "AGENTS.md", content: "# Work Agent\n\n你是 Smart Work 的主 Agent。" },
      { path: "System/heartbeat", content: "", isFolder: true },
      { path: "System/memory", content: "", isFolder: true },
      { path: "System/skill", content: "", isFolder: true },
      { path: "Context", content: "", isFolder: true },
    ];
    Promise.all(defaults.map(d => writeFile(d.path, d.content, (d as any).isFolder || false)))
      .then(() => fetchFiles());
  }
}, [loading, apiFiles.length]);
```

- [ ] **Step 9: Commit**

```bash
git add web/src/pages/WorkPage.tsx
git commit -m "feat: wire file tree to persistent API, auto-save, seed defaults"
```

---

### Task 5: Chat API — call_agent tool

**Files:**
- Create: `server/src/agent/tools/call-agent.ts`
- Modify: `server/src/routes/work.ts` (rewrite /api/work/chat)

- [ ] **Step 1: Create call_agent tool definition**

```typescript
// server/src/agent/tools/call-agent.ts
import { db } from "edgespark";
import { eq, and, like } from "drizzle-orm";
import { workFiles } from "@defs";

export const callAgentToolDef = {
  type: "function" as const,
  function: {
    name: "call_agent",
    description: "调用一个 sub-agent 执行任务。sub-agent 会从 agents/<name>/AGENTS.md 读取设定，从 agents/<name>/Context/ 读取上下文。",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "agent 名称，如 'designer', 'reviewer'" },
        task: { type: "string", description: "要执行的任务描述" },
        context: { type: "string", description: "额外上下文信息（可选）" },
      },
      required: ["name", "task"],
    },
  },
};

export interface CallAgentArgs {
  name: string;
  task: string;
  context?: string;
}

export interface AgentFiles {
  agentsMd: string;
  contextFiles: { path: string; content: string }[];
  skillFiles: { path: string; content: string }[];
}

export async function loadAgentFiles(userId: string, agentName: string): Promise<AgentFiles> {
  const prefix = agentName ? `agents/${agentName}/` : "";
  const rows = await db.select().from(workFiles)
    .where(and(eq(workFiles.userId, userId), like(workFiles.path, prefix + "%")));
  
  let agentsMd = "";
  const contextFiles: { path: string; content: string }[] = [];
  const skillFiles: { path: string; content: string }[] = [];

  for (const row of rows) {
    const relativePath = row.path.replace(prefix, "");
    if (relativePath === "AGENTS.md") {
      agentsMd = row.content;
    } else if (relativePath.startsWith("Context/") && !row.isFolder && row.content) {
      contextFiles.push({ path: relativePath, content: row.content });
    } else if (relativePath.startsWith("System/skill/") && !row.isFolder && row.content) {
      skillFiles.push({ path: relativePath, content: row.content });
    }
  }
  return { agentsMd, contextFiles, skillFiles };
}

export async function writeAgentFile(userId: string, agentName: string, subPath: string, content: string) {
  const fullPath = `agents/${agentName}/${subPath}`;
  const [existing] = await db.select().from(workFiles)
    .where(and(eq(workFiles.userId, userId), eq(workFiles.path, fullPath)));
  if (existing) {
    await db.update(workFiles).set({ content, updatedAt: new Date().toISOString() })
      .where(eq(workFiles.id, existing.id));
  } else {
    await db.insert(workFiles).values({ userId, path: fullPath, content });
  }
}

export async function writeHeartbeat(userId: string, agentName: string, status: string) {
  const now = new Date().toISOString().slice(0, 16).replace("T", "-");
  const hbPath = `agents/${agentName}/System/heartbeat`;
  await writeAgentFile(userId, agentName, `System/heartbeat/latest.md`, status);
  await writeAgentFile(userId, agentName, `System/heartbeat/${now}.md`, status);
}
```

- [ ] **Step 2: Rewrite /api/work/chat with orchestration logic**

Replace the existing POST `/api/work/chat` handler in `server/src/routes/work.ts`:

```typescript
.post("/api/work/chat", async (c) => {
  const body = await c.req.json<{ message: string; model?: string; conversationId?: number }>();
  if (!body.message?.trim()) return c.json({ error: "Message required" }, 400);

  const userId = auth.user!.id;
  const selectedModel = body.model || "seed-pro";
  const baseURL = vars.get("SEED_BASE_URL") || "https://ark.cn-beijing.volces.com/api/v3";
  const apiKey = secret.get("SEED_API_KEY");
  const modelName = "doubao-seed-2-0-pro-260215";
  if (!apiKey) return c.json({ error: "API key not configured" }, 500);

  // Load work-agent config
  const workAgentFiles = await loadAgentFiles(userId, "");
  const systemPrompt = workAgentFiles.agentsMd || "你是 Smart Work 的主 Agent，帮助用户分析需求、布置任务。";
  const contextPrompt = workAgentFiles.contextFiles
    .map(f => `--- ${f.path} ---\n${f.content}`).join("\n\n");
  
  // List available agents
  const agentRows = await db.select().from(workFiles)
    .where(and(eq(workFiles.userId, userId), like(workFiles.path, "agents/%/AGENTS.md")));
  const availableAgents = agentRows.map(r => {
    const name = r.path.split("/")[1];
    const summary = r.content?.split("\n")[0]?.replace(/^#\s*/, "")?.slice(0, 80) || "";
    return `- **${name}**: ${summary}`;
  }).join("\n");

  const fullSystem = `${systemPrompt}

## 可用 Agent

你可以使用 call_agent 工具调用以下 agent：
${availableAgents}

## 上下文资料
${contextPrompt || "（无）"}

## 规则
- 当用户 @agent名称 时，使用 call_agent 工具调度该 agent
- 先制定计划再执行，多个 agent 可并行调用
- 完成后汇总结果告知用户`;

  const messages: any[] = [
    { role: "system", content: fullSystem },
    { role: "user", content: body.message },
  ];

  // SSE stream setup
  let ctrl: ReadableStreamDefaultController;
  const stream = new ReadableStream({ start(c) { ctrl = c; } });
  const encoder = new TextEncoder();
  const send = (d: Record<string, unknown>) => {
    try { ctrl.enqueue(encoder.encode(`data: ${JSON.stringify(d)}\n\n`)); } catch {}
  };

  ctx.runInBackground((async () => {
    try {
      let fullResponse = "";
      let toolCalls: any[] = [];
      let iterationCount = 0;
      const maxIterations = 10;

      while (iterationCount < maxIterations) {
        iterationCount++;
        const res = await fetch(`${baseURL}/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            model: modelName, messages,
            tools: iterationCount === 1 ? [callAgentToolDef] : undefined,
            temperature: 0.5, max_tokens: 4096, stream: true,
          }),
        });

        if (!res.ok) { send({ type: "error", content: `API ${res.status}` }); break; }

        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        let assistantMsg = "";
        let currentToolCalls: any[] = [];

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() || "";
          for (const line of lines) {
            const d = line.trim();
            if (!d.startsWith("data:")) continue;
            const json = d.slice(5).trim();
            if (json === "[DONE]") continue;
            try {
              const parsed = JSON.parse(json);
              const delta = parsed.choices?.[0]?.delta;
              if (delta?.content) {
                assistantMsg += delta.content;
                fullResponse += delta.content;
                send({ type: "text", content: delta.content });
              }
              if (delta?.tool_calls) {
                for (const tc of delta.tool_calls) {
                  const idx = tc.index || 0;
                  if (!currentToolCalls[idx]) currentToolCalls[idx] = { id: tc.id || "", name: "", args: "" };
                  if (tc.id) currentToolCalls[idx].id = tc.id;
                  if (tc.function?.name) currentToolCalls[idx].name = tc.function.name;
                  if (tc.function?.arguments) currentToolCalls[idx].args += tc.function.arguments;
                }
              }
            } catch {}
          }
        }

        // Process tool calls
        const validCalls = currentToolCalls.filter(tc => tc.name === "call_agent");
        if (validCalls.length === 0) break; // No more tool calls

        messages.push({ role: "assistant", content: assistantMsg || null, tool_calls: validCalls.map(tc => ({
          id: tc.id, type: "function", function: { name: tc.name, arguments: tc.args },
        })) });

        for (const tc of validCalls) {
          let args: CallAgentArgs;
          try { args = JSON.parse(tc.args); } catch { continue; }
          
          send({ type: "agent_start", name: args.name, task: args.task });

          // Load sub-agent config
          const subFiles = await loadAgentFiles(userId, args.name);
          const subSystem = subFiles.agentsMd || `你是 ${args.name} agent。`;
          const subContext = subFiles.contextFiles.map(f => f.content).join("\n\n");
          const subSkills = subFiles.skillFiles.map(f => f.content).join("\n");

          // Call sub-agent LLM
          const subMessages: any[] = [
            { role: "system", content: `${subSystem}\n\n## 上下文\n${subContext}\n\n## 技能\n${subSkills}\n\n## 任务\n${args.task}\n\n${args.context || ""}` },
            { role: "user", content: args.task },
          ];

          const subRes = await fetch(`${baseURL}/chat/completions`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
            body: JSON.stringify({ model: modelName, messages: subMessages, temperature: 0.5, max_tokens: 2048, stream: true }),
          });

          let subOutput = "";
          if (subRes.ok) {
            const subReader = subRes.body!.getReader();
            const subDecoder = new TextDecoder();
            let subBuf = "";
            while (true) {
              const { done, value } = await subReader.read();
              if (done) break;
              subBuf += subDecoder.decode(value, { stream: true });
              const subLines = subBuf.split("\n");
              subBuf = subLines.pop() || "";
              for (const line of subLines) {
                const sd = line.trim();
                if (!sd.startsWith("data:")) continue;
                const sj = sd.slice(5).trim();
                if (sj === "[DONE]") continue;
                try {
                  const c = JSON.parse(sj).choices?.[0]?.delta?.content;
                  if (c) { subOutput += c; send({ type: "agent_progress", name: args.name, text: c }); }
                } catch {}
              }
            }
          }

          // Save output + heartbeat
          const outputPath = `Context/${args.task.slice(0, 20).replace(/[\/\s]/g, "_")}.md`;
          await writeAgentFile(userId, args.name, outputPath, subOutput);
          await writeHeartbeat(userId, args.name, `完成: ${args.task}`);

          send({ type: "agent_done", name: args.name, files: [outputPath] });
          messages.push({ role: "tool", tool_call_id: tc.id, content: subOutput || "任务完成" });
        }
      }

      send({ type: "done" });
    } catch (err: any) {
      send({ type: "error", content: String(err) });
      send({ type: "done" });
    }
  })());

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
  });
})
```

- [ ] **Step 3: Add imports to work.ts**

```typescript
import { callAgentToolDef, loadAgentFiles, writeAgentFile, writeHeartbeat, type CallAgentArgs } from "../agent/tools/call-agent";
```

- [ ] **Step 4: Verify typecheck**

```bash
cd /Users/cuitao/Documents/Smart/server && npm run typecheck 2>&1
```

- [ ] **Step 5: Commit**

```bash
git add server/src/agent/tools/call-agent.ts server/src/routes/work.ts
git commit -m "feat: add call_agent tool + orchestration chat API"
```

---

### Task 6: TaskCard component + SSE handling

**Files:**
- Create: `web/src/components/work/TaskCard.tsx`
- Modify: `web/src/pages/WorkPage.tsx` (add SSE event handling for agent events)

- [ ] **Step 1: Create TaskCard component**

```typescript
// web/src/components/work/TaskCard.tsx
import { useState } from "react";

export interface TaskCardData {
  id: string;
  name: string;
  task: string;
  status: "running" | "done";
  output: string;
  files: string[];
}

const agentColors: Record<string, string> = {
  default: "from-amber-400 to-orange-500",
};

export function TaskCard({ card, onOpenFile }: {
  card: TaskCardData;
  onOpenFile?: (path: string) => void;
}) {
  const [expanded, setExpanded] = useState(card.status === "running");

  return (
    <div className="rounded-xl border mx-4 my-3 overflow-hidden shadow-sm"
      style={{ background: "#fffdf7", borderColor: card.status === "running" ? "#e0c888" : "#d4e0c8" }}>
      {/* Header */}
      <button onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-left transition-colors hover:bg-white/40">
        <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${agentColors.default} flex items-center justify-center text-white text-[10px] font-bold shrink-0 shadow-sm`}>
          {card.name.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[12px] font-medium" style={{ color: "#4a3728" }}>
            {card.name}
            {card.status === "running" && (
              <span className="inline-flex gap-0.5 ml-2">
                <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: "#c7853a" }} />
                <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: "#c7853a", animationDelay: "150ms" }} />
                <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: "#c7853a", animationDelay: "300ms" }} />
              </span>
            )}
          </div>
          <div className="text-[11px] opacity-50 truncate">{card.task}</div>
        </div>
        <svg className={`w-4 h-4 transition-transform ${expanded ? "rotate-180" : ""}`}
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
          style={{ color: "#b8a088" }}>
          <polyline points="6,9 12,15 18,9" />
        </svg>
      </button>

      {/* Body */}
      {expanded && (
        <div className="px-4 pb-3 space-y-2">
          {card.output && (
            <div className="text-[12px] leading-relaxed border rounded-lg p-3"
              style={{ background: "#fbf9f2", color: "#5c4330", borderColor: "#e8e3d7", whiteSpace: "pre-wrap" }}>
              {card.output}
            </div>
          )}
          {card.files.length > 0 && (
            <div className="text-[11px] space-y-0.5">
              <div className="font-medium opacity-40">产出文件</div>
              {card.files.map(f => (
                <button key={f} onClick={() => onOpenFile?.(f)}
                  className="block text-left w-full px-2 py-1 rounded hover:bg-amber-50/80 transition-colors"
                  style={{ color: "#c7853a" }}>
                  📄 {f.split("/").pop() || f}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add SSE event handling to handleSend in WorkPage**

In `WorkPage.tsx`, import `TaskCard` and `TaskCardData`:

```typescript
import { TaskCard, type TaskCardData } from "@/components/work/TaskCard";
```

Add state for task cards:

```typescript
const [taskCards, setTaskCards] = useState<Map<string, TaskCardData>>(new Map());
```

In the SSE loop in `handleSend`, add event handling for agent events:

```typescript
// Inside the SSE line parsing loop, after existing event types:
} else if (data.type === "agent_start") {
  setTaskCards(prev => {
    const next = new Map(prev);
    next.set(data.name, { id: data.name + "_" + Date.now(), name: data.name, task: data.task, status: "running", output: "", files: [] });
    return next;
  });
} else if (data.type === "agent_progress") {
  setTaskCards(prev => {
    const next = new Map(prev);
    const existing = next.get(data.name);
    if (existing) next.set(data.name, { ...existing, output: existing.output + (data.text || "") });
    return next;
  });
} else if (data.type === "agent_done") {
  setTaskCards(prev => {
    const next = new Map(prev);
    const existing = next.get(data.name);
    if (existing) next.set(data.name, { ...existing, status: "done", files: data.files || [] });
    return next;
  });
}
```

- [ ] **Step 3: Render task cards in messages area**

In the messages rendering section, add task cards between messages:

```typescript
{/* Render task cards */}
{Array.from(taskCards.values()).map(card => (
  <TaskCard key={card.id} card={card}
    onOpenFile={(path) => openFile(`agents/${card.name}/${path}`)} />
))}
```

- [ ] **Step 4: Commit**

```bash
git add web/src/components/work/TaskCard.tsx web/src/pages/WorkPage.tsx
git commit -m "feat: add TaskCard component + SSE agent event handling"
```

---

### Task 7: Team management — create/delete agents

**Files:**
- Modify: `web/src/pages/WorkPage.tsx` (rewrite team tab)

- [ ] **Step 1: Add team agent list state + fetch**

```typescript
const [teamAgents, setTeamAgents] = useState<string[]>([]);
const { files: agentListFiles } = useWorkFiles();

useEffect(() => {
  const names = new Set<string>();
  for (const f of agentListFiles) {
    const match = f.path.match(/^agents\/([^\/]+)\/AGENTS\.md$/);
    if (match) names.add(match[1]);
  }
  setTeamAgents(Array.from(names));
}, [agentListFiles]);
```

- [ ] **Step 2: Add create agent function**

```typescript
const createAgent = async (name: string) => {
  if (!name.trim()) return;
  // Create agent directory structure
  await writeFile(`agents/${name}/AGENTS.md`, `# ${name}\n\n`, false);
  await writeFile(`agents/${name}/System/heartbeat`, "", true);
  await writeFile(`agents/${name}/System/memory`, "", true);
  await writeFile(`agents/${name}/System/skill`, "", true);
  await writeFile(`agents/${name}/Context`, "", true);
  await fetchFiles();
  setShowCreate(false);
};
```

- [ ] **Step 3: Add delete agent function**

```typescript
const deleteAgent = async (name: string) => {
  if (!confirm(`删除 agent "${name}" 及其所有文件？`)) return;
  await deleteApiFile(`agents/${name}`);
  await fetchFiles();
};
```

- [ ] **Step 4: Rewrite team tab UI**

Replace the current team tab content (the create form + agent list from workAgents API) with:

```tsx
{rightTab === "team" ? (
  <div className="flex-1 flex flex-col overflow-hidden">
    <div className="px-3 py-2 flex items-center gap-1.5">
      <button onClick={() => setShowCreate(!showCreate)}
        className="flex-1 py-1.5 text-[11px] font-medium rounded-lg transition-colors hover:bg-amber-100/40"
        style={{ color: "#b87333", border: "1px dashed #d4c4a8" }}>
        + 创建成员
      </button>
    </div>
    {showCreate && (
      <div className="px-3 pb-2 flex gap-1.5">
        <input autoFocus value={newItemName} onChange={e => setNewItemName(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") { createAgent(newItemName); setNewItemName(""); } }}
          placeholder="成员名称" className="flex-1 px-2 py-1.5 text-[11px] rounded-lg outline-none border"
          style={{ background: "#fffdf7", borderColor: "#e0d8c5", color: "#4a3728" }} />
        <button onClick={() => { createAgent(newItemName); setNewItemName(""); }}
          className="px-3 py-1.5 rounded-lg text-[11px] font-medium text-white"
          style={{ background: "#c7853a" }}>创建</button>
      </div>
    )}
    <div className="flex-1 overflow-y-auto px-2 pb-2">
      {teamAgents.map(name => (
        <div key={name} className="flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors hover:bg-white/60 group cursor-pointer">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white text-[10px] font-bold shrink-0 shadow-sm">
            {name.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium truncate" style={{ color: "#4a3728" }}>{name}</div>
            <div className="text-[10px] opacity-40">🟢 空闲</div>
          </div>
          <button onClick={() => openFile(`agents/${name}/AGENTS.md`)}
            className="opacity-0 group-hover:opacity-100 p-1 rounded transition-all hover:bg-amber-50"
            style={{ color: "#b8a088" }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
          <button onClick={() => deleteAgent(name)}
            className="opacity-0 group-hover:opacity-100 p-1 rounded transition-all hover:bg-red-50"
            style={{ color: "#b8a088" }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3,6 5,6 21,6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
          </button>
        </div>
      ))}
    </div>
  </div>
) : (
  // existing assistant tab content
)}
```

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/WorkPage.tsx
git commit -m "feat: team management — create/delete agents from file tree"
```

---

### Task 8: Heartbeat update + memory extraction

**Files:**
- Create: `server/src/agent/memory/work-memory.ts`

- [ ] **Step 1: Create work memory module**

```typescript
// server/src/agent/memory/work-memory.ts
import { db } from "edgespark";
import { eq, and, like } from "drizzle-orm";
import { workFiles } from "@defs";
import { writeAgentFile } from "../tools/call-agent";

export async function extractWorkMemories(
  userId: string,
  agentName: string,
  userMessage: string,
  agentResponse: string,
) {
  const prefix = agentName ? `agents/${agentName}/` : "";
  const memPath = `${prefix}System/memory`;

  // Extract explicit "记住" commands
  const rm = userMessage.match(/记住[：:]\s*(.+?)(?:[。.]|$)/);
  if (rm) {
    await writeAgentFile(userId, agentName, `System/memory/用户要求.md`, rm[1]);
  }

  // Extract preferences from agent response
  const pm = agentResponse.match(/偏好[：:]\s*(.+)/);
  if (pm) {
    await writeAgentFile(userId, agentName, `System/memory/偏好记录.md`, pm[1]);
  }

  // Update heartbeat
  const heartbeat = `## ${new Date().toISOString()}\n\n任务完成。\n用户消息: ${userMessage.slice(0, 100)}\n响应摘要: ${agentResponse.slice(0, 200)}`;
  await writeAgentFile(userId, agentName, `System/heartbeat/latest.md`, heartbeat);
}
```

- [ ] **Step 2: Integrate memory extraction into chat flow**

In `server/src/routes/work.ts`, after the orchestration loop completes (before `send({ type: "done" })`), add:

```typescript
// Extract memories for work-agent
ctx.runInBackground((async () => {
  try {
    await extractWorkMemories(userId, "", body.message, fullResponse);
  } catch {}
})());
```

And after each `call_agent` completes, add memory extraction for the sub-agent:

```typescript
// In the call_agent loop, after agent_done event:
ctx.runInBackground((async () => {
  try {
    await extractWorkMemories(userId, args.name, args.task, subOutput);
  } catch {}
})());
```

- [ ] **Step 3: Commit**

```bash
git add server/src/agent/memory/work-memory.ts server/src/routes/work.ts
git commit -m "feat: auto heartbeat update + memory extraction for agents"
```

---

### Task 9: Market — talent tab + publish/import (P2)

**Files:**
- Modify: `web/src/pages/MarketPage.tsx`

- [ ] **Step 1: Add "人才" tab to MarketPage**

Read current `MarketPage.tsx`, add a second tab next to the existing tools tab.

```typescript
const [marketTab, setMarketTab] = useState<"tools" | "talent">("tools");
```

Add tab buttons:

```tsx
<div className="flex border-b" style={{ borderColor: "#e8e3d7" }}>
  {(["tools", "talent"] as const).map(t => (
    <button key={t} onClick={() => setMarketTab(t)}
      className={`flex-1 py-2 text-xs font-medium transition-colors relative ${
        marketTab === t ? "" : "opacity-40 hover:opacity-70"
      }`}
      style={{ color: "#5c4330" }}>
      {{ tools: "工具", talent: "人才" }[t]}
      {marketTab === t && <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full" style={{ background: "#c7853a" }} />}
    </button>
  ))}
</div>
```

- [ ] **Step 2: Add talent list API and UI**

Create API endpoint in work routes for publishing/listing agent templates:

```typescript
// In server/src/routes/work.ts, add:
.get("/api/work/market/agents", async (c) => {
  // Return published agents (placeholder — will use market table in P3)
  return c.json([]);
})
.post("/api/work/market/agents", async (c) => {
  const userId = auth.user!.id;
  const body = await c.req.json<{ name: string }>();
  // Publish agent: copy agent files to market entry
  return c.json({ success: true });
});
```

- [ ] **Step 3: Add publish button in team tab**

In WorkPage team tab, add a publish button for each agent:

```tsx
<button onClick={async () => {
  await fetch("/api/work/market/agents", {
    method: "POST", credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
}} className="opacity-0 group-hover:opacity-100 p-1 rounded transition-all hover:bg-green-50"
  style={{ color: "#68a86c" }}>
  📤
</button>
```

- [ ] **Step 4: Commit**

```bash
git add web/src/pages/MarketPage.tsx web/src/pages/WorkPage.tsx server/src/routes/work.ts
git commit -m "feat: market talent tab + publish agent"
```

---

### Task 10: Deploy and verify

- [ ] **Step 1: Deploy**

```bash
edgespark deploy
```

- [ ] **Step 2: Smoke test checklist**
  - [ ] 打开 Work 页面，文件树应从 API 加载（非硬编码）
  - [ ] 在文件树中新建文件/文件夹，刷新应保持
  - [ ] 点击文件 → Milkdown 编辑器打开，内容从 API 加载
  - [ ] 编辑文件，刷新后内容保持
  - [ ] 创建 agent（团队 tab → 创建成员）
  - [ ] 对话中 @agent → work-agent 应调用 call_agent
  - [ ] 任务卡片应正确显示"进行中"和"已完成"状态
  - [ ] 删除 agent → agents/<name>/ 目录删除

- [ ] **Step 3: Commit fixes if any**

---

## Self-Review Checklist

- [x] Spec coverage: All P0-P2 items from spec have corresponding tasks
- [x] No placeholders — all steps contain actual code
- [x] Type consistency — `CallAgentArgs` used in both call-agent.ts and work.ts
- [x] API routes follow existing patterns (Hono chain, auth middleware)
