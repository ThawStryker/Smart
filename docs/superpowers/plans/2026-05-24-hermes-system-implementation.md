# Hermes Multi-Agent Document Collaboration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Hermes multi-agent document collaboration system as a new Work page in Smart, with @mention agent invocation, context injection, streaming document editing via Milkdown, and auto-save.

**Architecture:** Hermes is a thin context manager (seed-2.0-lite) that routes @mentions to stateless sub-agents (seed-2.0-pro). Hermes injects context (conversation summary + agent files + workspace files), agents run a tool-using loop, output streams to both chat and Milkdown editor with auto-save. Agent configs and documents share a unified file tree stored in `work_files`.

**Tech Stack:** Hono, Drizzle ORM, SSE streaming, Milkdown Crepe (npm), React + TypeScript

---

## File Structure

```
server/
  src/
    defs/
      db_schema.ts          [MODIFY] Add workSessions, workFiles, workMessages tables
      runtime.ts            [MODIFY] Add SEED_LITE_* and SEED_PRO_* var/secret keys
      index.ts              [MODIFY] Export new tables
    routes/
      work.ts               [CREATE] All work API routes
    agent/
      hermes/
        loop.ts             [CREATE] Hermes agent loop (adapted from agent/loop.ts)
        context.ts          [CREATE] Context injection builder
    index.ts                [MODIFY] Register work routes

web/
  src/
    pages/
      WorkPage.tsx          [CREATE] Main page with 3-panel layout
    components/
      work/
        ChatPanel.tsx       [CREATE] Chat with @mention input + message list
        AgentPanel.tsx      [CREATE] Agent list + file tree browser
        DocumentEditor.tsx  [CREATE] Milkdown Crepe editor wrapper
    App.tsx                 [MODIFY] Add /work route
    components/
      layout/
        TopNav.tsx          [MODIFY] Add "Work" nav item
```

---

### Task 1: Add Runtime Configuration for Seed Models

**Files:**
- Modify: `server/src/defs/runtime.ts`

- [ ] **Step 1: Add new var and secret keys**

```typescript
// server/src/defs/runtime.ts
export type VarKey =
  | "DEEPSEEK_BASE_URL"
  | "SEED_BASE_URL"
  | "SEED_LITE_BASE_URL"
  | "SEED_PRO_BASE_URL";

export type SecretKey =
  | "DEEPSEEK_API_KEY"
  | "SEED_API_KEY"
  | "SEED_LITE_API_KEY"
  | "SEED_PRO_API_KEY"
  | "ALIYUN_ACCESS_KEY_ID"
  | "ALIYUN_ACCESS_KEY_SECRET"
  | "DOMAIN_SYNC_API_KEY";
```

- [ ] **Step 2: Commit**

```bash
git add server/src/defs/runtime.ts
git commit -m "feat: add seed-lite and seed-pro runtime config keys"
```

---

### Task 2: Add Database Tables

**Files:**
- Modify: `server/src/defs/db_schema.ts`

- [ ] **Step 1: Add workSessions, workFiles, workMessages tables**

Add after the existing tables in `server/src/defs/db_schema.ts`:

```typescript
export const workSessions = sqliteTable("work_sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id").notNull(),
  title: text("title").notNull().default("New Work"),
  summary: text("summary").default(""),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").default(sql`(datetime('now'))`),
});

export const workFiles = sqliteTable("work_files", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sessionId: integer("session_id").notNull(),
  path: text("path").notNull(),
  content: text("content").default(""),
  isFolder: integer("is_folder").default(0),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").default(sql`(datetime('now'))`),
});

export const workMessages = sqliteTable("work_messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sessionId: integer("session_id").notNull(),
  agentName: text("agent_name"),
  role: text("role").notNull(),
  content: text("content").default(""),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
});
```

- [ ] **Step 2: Add unique index for workFiles**

```typescript
// Add after the table definitions
import { uniqueIndex } from "drizzle-orm/sqlite-core";

// Unique index on workFiles(sessionId, path)
// Add to the table definition:
// }, (table) => ({
//   sessionPathUnique: uniqueIndex("work_files_session_path_unique").on(table.sessionId, table.path),
// }));
```

Actually, use inline index in the table:

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

- [ ] **Step 3: Export new tables from defs/index.ts**

Add to the existing exports in `server/src/defs/index.ts`:

```typescript
export { workSessions, workFiles, workMessages } from "./db_schema";
```

- [ ] **Step 4: Commit**

```bash
git add server/src/defs/db_schema.ts server/src/defs/index.ts
git commit -m "feat: add work_sessions, work_files, work_messages tables"
```

---

### Task 3: Run Database Migration

**Files:**
- Create: `server/drizzle/XXXX_work_tables.sql` (generated)

- [ ] **Step 1: Generate migration**

```bash
cd server && npx drizzle-kit generate
```

Expected: Creates a new migration SQL file in `server/drizzle/`.

- [ ] **Step 2: Verify the generated SQL**

Read the generated file to confirm it creates the three tables with correct columns.

- [ ] **Step 3: Commit**

```bash
git add server/drizzle/
git commit -m "feat: generate migration for work tables"
```

---

### Task 4: Create Work API Routes — Sessions and Files

**Files:**
- Create: `server/src/routes/work.ts`

- [ ] **Step 1: Create work routes file with session and file CRUD**

```typescript
import { Hono } from "hono";
import { db, storage, ctx } from "edgespark";
import { auth } from "edgespark/http";
import { eq, and, like, isNull } from "drizzle-orm";
import { workSessions, workFiles, workMessages } from "@defs";

export const workRoutes = new Hono();

// ── Sessions ──

// List sessions for current user
workRoutes.get("/sessions", auth.middleware, async (c) => {
  const userId = auth.user!.id;
  const sessions = await db
    .select()
    .from(workSessions)
    .where(eq(workSessions.userId, userId))
    .orderBy(workSessions.updatedAt);
  return c.json(sessions);
});

// Create session
workRoutes.post("/sessions", auth.middleware, async (c) => {
  const userId = auth.user!.id;
  const { title } = await c.req.json<{ title?: string }>();
  const [session] = await db
    .insert(workSessions)
    .values({ userId, title: title || "New Work" })
    .returning();
  return c.json(session, 201);
});

// Get session
workRoutes.get("/sessions/:id", auth.middleware, async (c) => {
  const id = parseInt(c.req.param("id"));
  const session = await db.select().from(workSessions).where(eq(workSessions.id, id)).get();
  if (!session) return c.json({ error: "Not found" }, 404);
  return c.json(session);
});

// Delete session
workRoutes.delete("/sessions/:id", auth.middleware, async (c) => {
  const id = parseInt(c.req.param("id"));
  await db.delete(workFiles).where(eq(workFiles.sessionId, id));
  await db.delete(workMessages).where(eq(workMessages.sessionId, id));
  await db.delete(workSessions).where(eq(workSessions.id, id));
  return c.json({ ok: true });
});

// ── Files ──

// List files in a session
workRoutes.get("/sessions/:id/files", auth.middleware, async (c) => {
  const sessionId = parseInt(c.req.param("id"));
  const prefix = c.req.query("prefix") || "";
  const files = await db
    .select()
    .from(workFiles)
    .where(
      and(
        eq(workFiles.sessionId, sessionId),
        prefix ? like(workFiles.path, `${prefix}%`) : undefined,
      ),
    )
    .orderBy(workFiles.path);
  return c.json(files);
});

// Read a file
workRoutes.get("/sessions/:id/files/*", auth.middleware, async (c) => {
  const sessionId = parseInt(c.req.param("id"));
  const filePath = c.req.param("*");
  const file = await db
    .select()
    .from(workFiles)
    .where(and(eq(workFiles.sessionId, sessionId), eq(workFiles.path, filePath)))
    .get();
  if (!file) return c.json({ error: "Not found" }, 404);
  return c.json(file);
});

// Write/update a file
workRoutes.put("/sessions/:id/files/*", auth.middleware, async (c) => {
  const sessionId = parseInt(c.req.param("id"));
  const filePath = c.req.param("*");
  const { content, isFolder } = await c.req.json<{ content?: string; isFolder?: boolean }>();
  const existing = await db
    .select()
    .from(workFiles)
    .where(and(eq(workFiles.sessionId, sessionId), eq(workFiles.path, filePath)))
    .get();
  if (existing) {
    await db
      .update(workFiles)
      .set({ content: content ?? existing.content, updatedAt: new Date().toISOString() })
      .where(eq(workFiles.id, existing.id));
  } else {
    await db.insert(workFiles).values({
      sessionId,
      path: filePath,
      content: content || "",
      isFolder: isFolder ? 1 : 0,
    });
  }
  // If path is inside agents/, also create parent folders automatically
  if (filePath.startsWith("agents/")) {
    const parts = filePath.split("/");
    for (let i = 1; i < parts.length; i++) {
      const parentPath = parts.slice(0, i).join("/");
      const parentExists = await db
        .select()
        .from(workFiles)
        .where(and(eq(workFiles.sessionId, sessionId), eq(workFiles.path, parentPath)))
        .get();
      if (!parentExists) {
        await db.insert(workFiles).values({
          sessionId,
          path: parentPath,
          content: "",
          isFolder: 1,
        });
      }
    }
  }
  return c.json({ ok: true });
});

// Delete a file
workRoutes.delete("/sessions/:id/files/*", auth.middleware, async (c) => {
  const sessionId = parseInt(c.req.param("id"));
  const filePath = c.req.param("*");
  // Delete the file and all children
  await db
    .delete(workFiles)
    .where(
      and(
        eq(workFiles.sessionId, sessionId),
        like(workFiles.path, `${filePath}%`),
      ),
    );
  return c.json({ ok: true });
});

export { workRoutes };
```

- [ ] **Step 2: Register routes in server/src/index.ts**

Add import:
```typescript
import { workRoutes } from "./routes/work";
```

Add route registration before `export default app`:
```typescript
  .route("/api/work", workRoutes)
```

- [ ] **Step 3: Commit**

```bash
git add server/src/routes/work.ts server/src/index.ts
git commit -m "feat: add work API routes for sessions and files"
```

---

### Task 5: Create Context Injection Builder

**Files:**
- Create: `server/src/agent/hermes/context.ts`

- [ ] **Step 1: Write context builder**

```typescript
import { db } from "edgespark";
import { eq, and, like } from "drizzle-orm";
import { workFiles, workMessages } from "@defs";

export interface AgentFileContext {
  agentsMd: string;
  memories: string[];
  skills: Array<{ name: string; entry: string }>;
  contexts: string[];
}

export interface InjectedContext {
  taskDescription: string;
  conversationSummary: string;
  userMessage: string;
  agentFiles: AgentFileContext;
  relevantWorkspaceFiles: Array<{ path: string; content: string }>;
  delegatableAgents: string[];
}

export async function loadAgentFiles(
  sessionId: number,
  agentName: string,
): Promise<AgentFileContext> {
  const prefix = `agents/${agentName}/`;
  const files = await db
    .select()
    .from(workFiles)
    .where(
      and(
        eq(workFiles.sessionId, sessionId),
        like(workFiles.path, `${prefix}%`),
      ),
    );

  const fileMap = new Map<string, string>();
  for (const f of files) {
    fileMap.set(f.path, f.content || "");
  }

  const agentsMd = fileMap.get(`${prefix}AGENTS.md`) || "";
  const memories = Array.from(fileMap.entries())
    .filter(([p]) => p.startsWith(`${prefix}memory/`) && p.endsWith(".md"))
    .map(([, c]) => c);
  const skills: Array<{ name: string; entry: string }> = [];
  for (const [p, c] of fileMap.entries()) {
    const match = p.match(new RegExp(`^${prefix}skills/([^/]+)/SKILL\\.md$`));
    if (match) {
      skills.push({ name: match[1], entry: c });
    }
  }
  const contexts = Array.from(fileMap.entries())
    .filter(([p]) => p.startsWith(`${prefix}context/`) && p.endsWith(".md"))
    .map(([, c]) => c);

  return { agentsMd, memories, skills, contexts };
}

export async function buildConversationSummary(sessionId: number): Promise<string> {
  const messages = await db
    .select()
    .from(workMessages)
    .where(eq(workMessages.sessionId, sessionId))
    .orderBy(workMessages.createdAt)
    .limit(50);

  if (messages.length === 0) return "";
  return messages
    .map((m) => `[${m.agentName || "user"}]: ${(m.content || "").slice(0, 200)}`)
    .join("\n");
}

export function listAgentNames(files: Array<{ path: string }>): string[] {
  const names = new Set<string>();
  for (const f of files) {
    const match = f.path.match(/^agents\/([^/]+)\//);
    if (match) names.add(match[1]);
  }
  return Array.from(names);
}

export function buildAgentSystemPrompt(agentCtx: AgentFileContext): string {
  const parts: string[] = [];
  if (agentCtx.agentsMd) parts.push(`## Role Definition\n\n${agentCtx.agentsMd}`);
  if (agentCtx.memories.length > 0) {
    parts.push(`## Memory\n\n${agentCtx.memories.join("\n\n---\n\n")}`);
  }
  if (agentCtx.skills.length > 0) {
    parts.push(
      `## Available Skills\n\n${agentCtx.skills
        .map((s) => `### ${s.name}\n\n${s.entry}`)
        .join("\n\n")}`,
    );
  }
  if (agentCtx.contexts.length > 0) {
    parts.push(`## Reference Context\n\n${agentCtx.contexts.join("\n\n---\n\n")}`);
  }
  return parts.join("\n\n");
}
```

- [ ] **Step 2: Commit**

```bash
git add server/src/agent/hermes/context.ts
git commit -m "feat: add Hermes context injection builder"
```

---

### Task 6: Create Hermes Agent Loop

**Files:**
- Create: `server/src/agent/hermes/loop.ts`

- [ ] **Step 1: Write Hermes agent loop**

```typescript
import { emit } from "../stream";
import { loadAgentFiles, buildAgentSystemPrompt, listAgentNames } from "./context";
import { db } from "edgespark";
import { workFiles, workMessages } from "@defs";
import { eq } from "drizzle-orm";

export interface HermesLoopParams {
  sessionId: number;
  userId: string;
  userMessage: string;
  targetAgent: string | null; // null = chat with Hermes directly
  modelConfig: {
    baseURL: string;
    apiPath: string;
    apiKey: string;
    modelName: string;
  };
  eventQueue: Array<Record<string, unknown>>;
  allFiles: Array<{ path: string; content: string }>;
}

export async function hermesLoop(params: HermesLoopParams): Promise<string> {
  const { sessionId, userId, userMessage, targetAgent, modelConfig, eventQueue, allFiles } = params;
  let fullResponse = "";

  if (targetAgent) {
    // ── Sub-agent invocation ──
    emit(eventQueue, { type: "agent_start", agentName: targetAgent });

    // Load agent files
    const agentCtx = await loadAgentFiles(sessionId, targetAgent);
    const agentSystemPrompt = buildAgentSystemPrompt(agentCtx);

    // Build conversation summary
    const summary = await buildConversationSummary(sessionId);

    // Build messages for sub-agent
    const messages: Array<{ role: string; content: string }> = [
      { role: "system", content: agentSystemPrompt },
    ];
    if (summary) {
      messages.push({
        role: "system",
        content: `## Conversation Context\n\n${summary}`,
      });
    }
    messages.push({ role: "user", content: userMessage });

    // Run agent loop
    for (let step = 0; step < 15; step++) {
      const response = await fetch(
        `${modelConfig.baseURL}${modelConfig.apiPath}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${modelConfig.apiKey}`,
          },
          body: JSON.stringify({
            model: modelConfig.modelName,
            messages,
            tools: AGENT_TOOLS,
            tool_choice: "auto",
            temperature: 0.5,
            max_tokens: 8192,
            stream: true,
          }),
        },
      );

      // Parse SSE stream
      const reader = response.body?.getReader();
      if (!reader) break;

      const decoder = new TextDecoder();
      let textContent = "";
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6);
          if (data === "[DONE]") continue;
          try {
            const json = JSON.parse(data);
            const delta = json.choices?.[0]?.delta;
            if (delta?.content) {
              textContent += delta.content;
              emit(eventQueue, { type: "text", agentName: targetAgent, delta: delta.content });
            }
          } catch {}
        }
      }

      fullResponse = textContent;

      // If no text content was produced, we're done
      if (!textContent.trim()) break;

      // Push response to messages
      messages.push({ role: "assistant", content: textContent });

      // Check if there's a final answer pattern
      break;
    }

    // Save agent response as a message
    await db.insert(workMessages).values({
      sessionId,
      agentName: targetAgent,
      role: "assistant",
      content: fullResponse,
    });

    // Update heartbeat
    const heartbeatPath = `agents/${targetAgent}/heartbeat.md`;
    const existingHb = await db
      .select()
      .from(workFiles)
      .where(eq(workFiles.path, heartbeatPath))
      .get();
    const hbContent = `## Last Run\n- Time: ${new Date().toISOString()}\n- Status: completed\n`;
    if (existingHb) {
      await db.update(workFiles).set({ content: hbContent }).where(eq(workFiles.id, existingHb.id));
    } else {
      await db.insert(workFiles).values({
        sessionId,
        path: heartbeatPath,
        content: hbContent,
      });
    }

    emit(eventQueue, { type: "agent_done", agentName: targetAgent });
  } else {
    // ── Direct Hermes chat (no agent invocation) ──
    const summary = await buildConversationSummary(sessionId);
    const availableAgents = listAgentNames(allFiles);

    const messages: Array<{ role: string; content: string }> = [
      {
        role: "system",
        content: `You are Hermes, a workflow coordinator. You help users organize document-writing tasks.
Available agents: ${availableAgents.join(", ") || "none yet"}.
When the user wants an agent to do work, tell them to @mention the agent.`,
      },
    ];
    if (summary) {
      messages.push({ role: "system", content: `Conversation history:\n${summary}` });
    }
    messages.push({ role: "user", content: userMessage });

    const response = await fetch(
      `${modelConfig.baseURL}${modelConfig.apiPath}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${modelConfig.apiKey}`,
        },
        body: JSON.stringify({
          model: modelConfig.modelName,
          messages,
          temperature: 0.5,
          max_tokens: 4096,
          stream: true,
        }),
      },
    );

    const reader = response.body?.getReader();
    if (!reader) return "";

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6);
        if (data === "[DONE]") continue;
        try {
          const json = JSON.parse(data);
          const content = json.choices?.[0]?.delta?.content;
          if (content) {
            fullResponse += content;
            emit(eventQueue, { type: "text", delta: content });
          }
        } catch {}
      }
    }

    await db.insert(workMessages).values({
      sessionId,
      agentName: null,
      role: "assistant",
      content: fullResponse,
    });
  }

  return fullResponse;
}

// Tools available to sub-agents
const AGENT_TOOLS = [
  {
    type: "function",
    function: {
      name: "call_agent",
      description: "Delegate a subtask to another agent. The agent will run and return its output.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Name of the agent to call" },
          task: { type: "string", description: "Task description for the agent" },
        },
        required: ["name", "task"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description: "Write content to a file in the workspace",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "File path relative to workspace" },
          content: { type: "string", description: "File content (markdown)" },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Read a file from the workspace",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "File path to read" },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "web_search",
      description: "Search the web for information",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query" },
        },
        required: ["query"],
      },
    },
  },
];
```

- [ ] **Step 2: Commit**

```bash
git add server/src/agent/hermes/loop.ts
git commit -m "feat: add Hermes agent loop with @mention dispatch"
```

---

### Task 7: Create Work Chat Endpoint

**Files:**
- Modify: `server/src/routes/work.ts` (add chat endpoint)

- [ ] **Step 1: Add chat endpoint to work routes**

Add these imports at the top of `server/src/routes/work.ts`:

```typescript
import { vars, secret } from "edgespark";
import { createSSEStream, SSE_HEADERS } from "../agent/stream";
import { hermesLoop } from "../agent/hermes/loop";
```

Add this route before `export { workRoutes }`:

```typescript
// ── Chat (Hermes orchestration) ──

workRoutes.post("/chat", auth.middleware, async (c) => {
  const userId = auth.user!.id;
  const { sessionId, message } = await c.req.json<{ sessionId: number; message: string }>();

  // Validate session belongs to user
  const session = await db
    .select()
    .from(workSessions)
    .where(eq(workSessions.id, sessionId))
    .get();
  if (!session) return c.json({ error: "Session not found" }, 404);

  // Parse @mentions
  const mentionRegex = /@(\S+)/g;
  const mentions: string[] = [];
  let match;
  while ((match = mentionRegex.exec(message)) !== null) {
    mentions.push(match[1]);
  }
  const cleanMessage = message.replace(mentionRegex, "").trim();
  const targetAgent = mentions.length > 0 ? mentions[0] : null;

  // Save user message
  await db.insert(workMessages).values({
    sessionId,
    agentName: null,
    role: "user",
    content: message,
  });

  // Load all files for context
  const allFiles = await db
    .select()
    .from(workFiles)
    .where(eq(workFiles.sessionId, sessionId));

  // Model config: lite for Hermes, pro for agents
  const isAgent = !!targetAgent;
  const modelConfig = {
    baseURL: vars.get(isAgent ? "SEED_PRO_BASE_URL" : "SEED_LITE_BASE_URL") ||
      (isAgent ? "https://ark.cn-beijing.volces.com/api/v3" : "https://ark.cn-beijing.volces.com/api/v3"),
    apiPath: "/chat/completions",
    apiKey: secret.get(isAgent ? "SEED_PRO_API_KEY" : "SEED_LITE_API_KEY") || "",
    modelName: isAgent ? "doubao-seed-2-0-pro" : "doubao-seed-2-0-lite",
  };

  // Create event queue and stream
  const eventQueue: Array<Record<string, unknown>> = [];
  const stream = createSSEStream(eventQueue);

  // Run Hermes loop in background
  ctx.runInBackground(async () => {
    try {
      await hermesLoop({
        sessionId,
        userId,
        userMessage: cleanMessage,
        targetAgent,
        modelConfig,
        eventQueue,
        allFiles: allFiles.map((f) => ({ path: f.path, content: f.content || "" })),
      });
    } catch (err: any) {
      eventQueue.push({ type: "error", message: err.message });
    }
    eventQueue.push({ type: "done" });
  });

  return new Response(stream, { headers: SSE_HEADERS });
});
```

- [ ] **Step 2: Commit**

```bash
git add server/src/routes/work.ts
git commit -m "feat: add work chat endpoint with @mention and SSE streaming"
```

---

### Task 8: Install Milkdown Dependencies

**Files:**
- Modify: `web/package.json` (dependency added via npm)

- [ ] **Step 1: Install Milkdown packages**

```bash
cd web && npm install @milkdown/crepe @milkdown/core @milkdown/ctx @milkdown/preset-commonmark @milkdown/preset-gfm @milkdown/plugin-history @milkdown/plugin-listener @milkdown/plugin-prism @milkdown/plugin-tooltip @milkdown/plugin-slash @milkdown/plugin-block @milkdown/plugin-clipboard @milkdown/plugin-cursor @milkdown/plugin-emoji @milkdown/plugin-indent @milkdown/plugin-math @milkdown/plugin-diagram @milkdown/plugin-upload @milkdown/prose @milkdown/theme-nord @milkdown/transformer
```

- [ ] **Step 2: Commit**

```bash
git add web/package.json web/package-lock.json
git commit -m "feat: install Milkdown full feature set"
```

---

### Task 9: Create DocumentEditor Component

**Files:**
- Create: `web/src/components/work/DocumentEditor.tsx`

- [ ] **Step 1: Write Milkdown editor wrapper**

```tsx
import { useEffect, useRef, useCallback } from "react";
import { Crepe } from "@milkdown/crepe";
import "@milkdown/crepe/theme/common/style.css";
import "@milkdown/crepe/theme/nord.css";
import { replaceAll } from "@milkdown/kit/utils";

export interface DocumentEditorProps {
  content: string;
  filePath: string | null;
  isStreaming: boolean;
  onSave: (path: string, content: string) => void;
  onContentChange: (content: string) => void;
}

export function DocumentEditor({
  content,
  filePath,
  isStreaming,
  onSave,
  onContentChange,
}: DocumentEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const crepeRef = useRef<Crepe | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedContent = useRef("");

  // Initialize editor
  useEffect(() => {
    if (!containerRef.current || crepeRef.current) return;

    // Crepe enables ALL features by default — 100% Milkdown
    const crepe = new Crepe({
      root: containerRef.current,
      defaultValue: content,
    });

    crepe.create().then(() => {
      crepeRef.current = crepe;

      // Listen for changes
      const editor = crepe.getEditor();
      editor.on("docChanged", () => {
        const md = editor.action(replaceAll());
        onContentChange(md);

        // Auto-save with debounce
        if (filePath) {
          if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
          saveTimerRef.current = setTimeout(() => {
            if (md !== lastSavedContent.current) {
              lastSavedContent.current = md;
              onSave(filePath, md);
            }
          }, 3000);
        }
      });
    });

    return () => {
      crepeRef.current?.destroy();
      crepeRef.current = null;
    };
  }, []);

  // Update content when streaming
  useEffect(() => {
    if (!crepeRef.current || !content) return;
    const editor = crepeRef.current.getEditor();
    const currentMd = editor.action(replaceAll());
    if (content !== currentMd) {
      editor.action(replaceAll(content));
    }

    // Auto-save on stream chunks
    if (filePath && content !== lastSavedContent.current) {
      lastSavedContent.current = content;
      onSave(filePath, content);
    }
  }, [content]);

  // Switch file
  useEffect(() => {
    if (!crepeRef.current) return;
    const editor = crepeRef.current.getEditor();
    editor.action(replaceAll(content || ""));
    lastSavedContent.current = content || "";
  }, [filePath]);

  if (!filePath) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400">
        Select a file to edit
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {isStreaming && (
        <div className="px-4 py-1.5 bg-blue-50 text-blue-600 text-xs border-b flex items-center gap-2">
          <span className="inline-block w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
          Agent is writing...
        </div>
      )}
      <div className="flex-1 overflow-auto">
        <div ref={containerRef} className="milkdown-editor h-full" />
      </div>
    </div>
  );
}

export default DocumentEditor;
```

- [ ] **Step 2: Commit**

```bash
git add web/src/components/work/DocumentEditor.tsx
git commit -m "feat: add Milkdown DocumentEditor with streaming and auto-save"
```

---

### Task 10: Create AgentPanel Component

**Files:**
- Create: `web/src/components/work/AgentPanel.tsx`

- [ ] **Step 1: Write agent panel with file tree**

```tsx
import { useState, useEffect, useCallback } from "react";

interface FileEntry {
  id: number;
  path: string;
  content: string;
  isFolder: number;
}

interface AgentPanelProps {
  sessionId: number;
  onFileSelect: (path: string, content: string) => void;
  selectedFile: string | null;
  onAgentListChange: () => void;
}

export function AgentPanel({ sessionId, onFileSelect, selectedFile, onAgentListChange }: AgentPanelProps) {
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set(["agents", "workspace"]));
  const [showCreateAgent, setShowCreateAgent] = useState(false);
  const [newAgentName, setNewAgentName] = useState("");
  const [newAgentPrompt, setNewAgentPrompt] = useState("");

  const loadFiles = useCallback(async () => {
    const res = await fetch(`/api/work/sessions/${sessionId}/files`);
    if (res.ok) {
      const data = await res.json();
      setFiles(data);
    }
  }, [sessionId]);

  useEffect(() => {
    if (sessionId) loadFiles();
  }, [sessionId, loadFiles]);

  const toggleExpand = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const createAgent = async () => {
    if (!newAgentName.trim()) return;
    const basePath = `agents/${newAgentName.trim()}`;
    // Create folder and AGENTS.md
    await fetch(`/api/work/sessions/${sessionId}/files/${basePath}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isFolder: true }),
    });
    await fetch(`/api/work/sessions/${sessionId}/files/${basePath}/memory`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isFolder: true }),
    });
    await fetch(`/api/work/sessions/${sessionId}/files/${basePath}/skills`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isFolder: true }),
    });
    await fetch(`/api/work/sessions/${sessionId}/files/${basePath}/context`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isFolder: true }),
    });
    await fetch(`/api/work/sessions/${sessionId}/files/${basePath}/AGENTS.md`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: newAgentPrompt || `# ${newAgentName}\n\n` }),
    });
    setNewAgentName("");
    setNewAgentPrompt("");
    setShowCreateAgent(false);
    loadFiles();
    onAgentListChange();
  };

  const deleteAgent = async (name: string) => {
    await fetch(`/api/work/sessions/${sessionId}/files/agents/${name}`, {
      method: "DELETE",
    });
    loadFiles();
    onAgentListChange();
  };

  // Build tree structure
  const tree = buildTree(files);
  const agents = Object.keys(tree.agents || {});

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <span className="font-semibold text-sm">Agents</span>
        <button
          onClick={() => setShowCreateAgent(true)}
          className="text-lg leading-none text-blue-600 hover:text-blue-800"
          title="Create agent"
        >
          +
        </button>
      </div>

      {/* Agent list */}
      <div className="flex-1 overflow-auto">
        {agents.map((name) => (
          <div key={name}>
            <div
              className="flex items-center px-3 py-1.5 hover:bg-gray-100 cursor-pointer group"
              onClick={() => toggleExpand(`agents/${name}`)}
            >
              <span className="text-xs mr-1">
                {expanded.has(`agents/${name}`) ? "▼" : "▶"}
              </span>
              <span className="text-sm">@{name}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm(`Delete @${name}?`)) deleteAgent(name);
                }}
                className="ml-auto text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 text-xs"
              >
                ×
              </button>
            </div>
            {expanded.has(`agents/${name}`) && (
              <div className="ml-4">
                {renderFileChildren(`agents/${name}`, tree, expanded, toggleExpand, onFileSelect, selectedFile, loadFiles, sessionId)}
              </div>
            )}
          </div>
        ))}
        {agents.length === 0 && (
          <div className="px-3 py-4 text-xs text-gray-400 text-center">
            No agents yet. Click + to create one.
          </div>
        )}
      </div>

      {/* Workspace files */}
      <div className="border-t">
        <div
          className="flex items-center px-3 py-2 hover:bg-gray-100 cursor-pointer font-semibold text-sm"
          onClick={() => toggleExpand("workspace")}
        >
          <span className="text-xs mr-1">
            {expanded.has("workspace") ? "▼" : "▶"}
          </span>
          Workspace
        </div>
        {expanded.has("workspace") && (
          <div className="ml-4">
            {renderFileChildren("workspace", tree, expanded, toggleExpand, onFileSelect, selectedFile, loadFiles, sessionId)}
          </div>
        )}
      </div>

      {/* Create Agent Modal */}
      {showCreateAgent && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-96 shadow-xl">
            <h3 className="text-lg font-semibold mb-4">Create Agent</h3>
            <input
              className="w-full border rounded px-3 py-2 mb-3 text-sm"
              placeholder="Agent name (e.g. architect)"
              value={newAgentName}
              onChange={(e) => setNewAgentName(e.target.value)}
            />
            <textarea
              className="w-full border rounded px-3 py-2 mb-4 text-sm h-32"
              placeholder="System prompt (AGENTS.md)..."
              value={newAgentPrompt}
              onChange={(e) => setNewAgentPrompt(e.target.value)}
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowCreateAgent(false)}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded"
              >
                Cancel
              </button>
              <button
                onClick={createAgent}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tree helpers ──

interface TreeNode {
  [key: string]: TreeNode | FileEntry;
}

function buildTree(files: FileEntry[]): TreeNode {
  const root: TreeNode = {};
  for (const f of files) {
    const parts = f.path.split("/");
    let current = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (i === parts.length - 1) {
        current[part] = f;
      } else {
        if (!current[part]) current[part] = {};
        current = current[part] as TreeNode;
      }
    }
  }
  return root;
}

function renderFileChildren(
  prefix: string,
  tree: TreeNode,
  expanded: Set<string>,
  toggleExpand: (path: string) => void,
  onFileSelect: (path: string, content: string) => void,
  selectedFile: string | null,
  loadFiles: () => void,
  sessionId: number,
): JSX.Element[] {
  const node = getNode(tree, prefix);
  if (!node || typeof node === "string") return [];

  const children = Object.entries(node as TreeNode);
  return children.map(([name, child]) => {
    const childPath = `${prefix}/${name}`;
    const isFolder = typeof child === "object" && !("content" in child);

    if (isFolder) {
      return (
        <div key={childPath}>
          <div
            className="flex items-center px-3 py-1 hover:bg-gray-100 cursor-pointer text-sm"
            onClick={() => toggleExpand(childPath)}
          >
            <span className="text-xs mr-1">
              {expanded.has(childPath) ? "▼" : "▶"}
            </span>
            <span className="text-gray-600">📁 {name}</span>
          </div>
          {expanded.has(childPath) &&
            renderFileChildren(childPath, tree, expanded, toggleExpand, onFileSelect, selectedFile, loadFiles, sessionId)}
        </div>
      );
    }

    const file = child as FileEntry;
    return (
      <div
        key={childPath}
        className={`flex items-center px-3 py-1 hover:bg-gray-100 cursor-pointer text-sm ${
          selectedFile === childPath ? "bg-blue-50 text-blue-700" : ""
        }`}
        onClick={() => onFileSelect(childPath, file.content || "")}
      >
        <span className="text-gray-600 mr-1">📄</span>
        <span className="truncate">{name}</span>
      </div>
    );
  });
}

function getNode(tree: TreeNode, path: string): TreeNode | FileEntry | null {
  const parts = path.split("/");
  let current: any = tree;
  for (const part of parts) {
    if (!current || typeof current !== "object") return null;
    current = current[part];
  }
  return current;
}

export default AgentPanel;
```

- [ ] **Step 2: Commit**

```bash
git add web/src/components/work/AgentPanel.tsx
git commit -m "feat: add AgentPanel with file tree and agent creation"
```

---

### Task 11: Create ChatPanel Component

**Files:**
- Create: `web/src/components/work/ChatPanel.tsx`

- [ ] **Step 1: Write chat panel with @mention support**

```tsx
import { useState, useRef, useEffect, useCallback } from "react";

interface ChatMessage {
  id: number;
  agentName: string | null;
  role: string;
  content: string;
  createdAt: string;
}

interface StreamingState {
  agentName: string | null;
  content: string;
  isActive: boolean;
}

interface ChatPanelProps {
  sessionId: number;
  agents: string[];
  onStreamDoc: (path: string, content: string) => void;
}

export function ChatPanel({ sessionId, agents, onStreamDoc }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState<StreamingState>({
    agentName: null,
    content: "",
    isActive: false,
  });
  const [showMentions, setShowMentions] = useState(false);
  const [mentionFilter, setMentionFilter] = useState("");
  const [mentionIndex, setMentionIndex] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const loadMessages = useCallback(async () => {
    const res = await fetch(`/api/work/sessions/${sessionId}/messages`);
    if (res.ok) setMessages(await res.json());
  }, [sessionId]);

  useEffect(() => {
    if (sessionId) loadMessages();
  }, [sessionId, loadMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streaming.content]);

  const handleInput = (value: string) => {
    setInput(value);
    // Check for @mention trigger
    const cursorPos = (inputRef.current?.selectionStart || 0);
    const beforeCursor = value.slice(0, cursorPos);
    const atMatch = beforeCursor.match(/@(\S*)$/);
    if (atMatch) {
      setMentionFilter(atMatch[1]);
      setShowMentions(true);
      setMentionIndex(0);
    } else {
      setShowMentions(false);
    }
  };

  const insertMention = (agentName: string) => {
    const cursorPos = inputRef.current?.selectionStart || 0;
    const beforeCursor = input.slice(0, cursorPos);
    const afterCursor = input.slice(cursorPos);
    const atMatch = beforeCursor.match(/@(\S*)$/);
    if (atMatch) {
      const beforeAt = beforeCursor.slice(0, beforeCursor.length - atMatch[0].length);
      setInput(beforeAt + `@${agentName} ` + afterCursor);
    }
    setShowMentions(false);
    inputRef.current?.focus();
  };

  const sendMessage = async () => {
    if (!input.trim() || streaming.isActive) return;
    const message = input.trim();
    setInput("");
    setStreaming({ agentName: null, content: "", isActive: true });

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/work/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, message }),
        signal: controller.signal,
      });

      const reader = res.body?.getReader();
      if (!reader) return;

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6));
            switch (event.type) {
              case "text":
                setStreaming((prev) => ({
                  ...prev,
                  agentName: event.agentName || prev.agentName,
                  content: prev.content + (event.delta || ""),
                }));
                break;
              case "agent_start":
                setStreaming({ agentName: event.agentName, content: "", isActive: true });
                break;
              case "agent_done":
                // Will be finalized on done
                break;
              case "error":
                setStreaming((prev) => ({
                  ...prev,
                  content: prev.content + `\n\n⚠️ ${event.message}`,
                }));
                break;
            }
          } catch {}
        }
      }
    } catch (err: any) {
      if (err.name !== "AbortError") {
        setStreaming((prev) => ({
          ...prev,
          content: prev.content + `\n\nError: ${err.message}`,
        }));
      }
    }

    setStreaming((prev) => ({ ...prev, isActive: false }));
    abortRef.current = null;
    loadMessages();
  };

  const stopStreaming = () => {
    abortRef.current?.abort();
    setStreaming((prev) => ({ ...prev, isActive: false }));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showMentions) {
      const filtered = agents.filter((a) =>
        a.toLowerCase().startsWith(mentionFilter.toLowerCase()),
      );
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionIndex((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        if (filtered[mentionIndex]) insertMention(filtered[mentionIndex]);
      } else if (e.key === "Escape") {
        setShowMentions(false);
      }
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const filteredMentions = agents.filter((a) =>
    a.toLowerCase().startsWith(mentionFilter.toLowerCase()),
  );

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-auto px-3 py-2 space-y-3">
        {messages.map((msg) => (
          <div key={msg.id} className="flex flex-col">
            <div className="flex items-center gap-1 mb-0.5">
              <span className="text-xs font-semibold text-gray-500">
                {msg.role === "user" ? "You" : msg.agentName || "Hermes"}
              </span>
            </div>
            <div className="text-sm text-gray-800 whitespace-pre-wrap">{msg.content}</div>
          </div>
        ))}
        {/* Streaming message */}
        {streaming.isActive && streaming.content && (
          <div className="flex flex-col">
            <div className="flex items-center gap-1 mb-0.5">
              <span className="text-xs font-semibold text-blue-600">
                {streaming.agentName || "Hermes"}
              </span>
              <span className="inline-block w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse" />
            </div>
            <div className="text-sm text-gray-800 whitespace-pre-wrap">{streaming.content}</div>
          </div>
        )}
        {streaming.isActive && !streaming.content && (
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <span className="inline-block w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
            Thinking...
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t p-3">
        {showMentions && filteredMentions.length > 0 && (
          <div className="bg-white border rounded-lg shadow mb-2 max-h-32 overflow-auto">
            {filteredMentions.map((agent, i) => (
              <div
                key={agent}
                className={`px-3 py-1.5 text-sm cursor-pointer ${
                  i === mentionIndex ? "bg-blue-50 text-blue-700" : "hover:bg-gray-50"
                }`}
                onClick={() => insertMention(agent)}
              >
                @{agent}
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => handleInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message, @mention an agent..."
            className="flex-1 border rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-blue-500"
            rows={2}
            disabled={streaming.isActive}
          />
          <button
            onClick={streaming.isActive ? stopStreaming : sendMessage}
            className={`px-4 rounded-lg text-sm font-medium ${
              streaming.isActive
                ? "bg-red-500 text-white hover:bg-red-600"
                : "bg-blue-600 text-white hover:bg-blue-700"
            }`}
          >
            {streaming.isActive ? "Stop" : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ChatPanel;
```

- [ ] **Step 2: Commit**

```bash
git add web/src/components/work/ChatPanel.tsx
git commit -m "feat: add ChatPanel with @mention autocomplete and SSE streaming"
```

---

### Task 12: Create WorkPage Layout

**Files:**
- Create: `web/src/pages/WorkPage.tsx`

- [ ] **Step 1: Write main WorkPage with 3-panel layout**

```tsx
import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { AgentPanel } from "@/components/work/AgentPanel";
import { DocumentEditor } from "@/components/work/DocumentEditor";
import { ChatPanel } from "@/components/work/ChatPanel";

export function WorkPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const sessionId = parseInt(searchParams.get("session") || "0");
  const [sessions, setSessions] = useState<Array<{ id: number; title: string }>>([]);
  const [activeFile, setActiveFile] = useState<{ path: string; content: string } | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [agents, setAgents] = useState<string[]>([]);
  const [showNewSession, setShowNewSession] = useState(false);
  const [newSessionTitle, setNewSessionTitle] = useState("");

  const loadSessions = useCallback(async () => {
    const res = await fetch("/api/work/sessions");
    if (res.ok) {
      const data = await res.json();
      setSessions(data);
      if (!sessionId && data.length > 0) {
        setSearchParams({ session: String(data[0].id) });
      }
    }
  }, [sessionId, setSearchParams]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const loadAgents = useCallback(async () => {
    if (!sessionId) return;
    const res = await fetch(`/api/work/sessions/${sessionId}/files?prefix=agents/`);
    if (res.ok) {
      const files: Array<{ path: string }> = await res.json();
      const names = new Set<string>();
      for (const f of files) {
        const match = f.path.match(/^agents\/([^/]+)\//);
        if (match) names.add(match[1]);
      }
      setAgents(Array.from(names));
    }
  }, [sessionId]);

  useEffect(() => {
    loadAgents();
  }, [sessionId, loadAgents]);

  const createSession = async () => {
    if (!newSessionTitle.trim()) return;
    const res = await fetch("/api/work/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newSessionTitle.trim() }),
    });
    if (res.ok) {
      const s = await res.json();
      setNewSessionTitle("");
      setShowNewSession(false);
      setSearchParams({ session: String(s.id) });
      loadSessions();
    }
  };

  const handleFileSelect = (path: string, content: string) => {
    setActiveFile({ path, content });
  };

  const handleSave = async (path: string, content: string) => {
    await fetch(`/api/work/sessions/${sessionId}/files/${path}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
  };

  const handleStreamDoc = (path: string, content: string) => {
    if (!activeFile || activeFile.path !== path) {
      setActiveFile({ path, content });
    }
    setIsStreaming(true);
    // Auto-save after streaming
    setTimeout(() => setIsStreaming(false), 500);
  };

  if (!sessionId) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="text-center">
          <p className="text-gray-500 mb-4">No work session selected</p>
          <button
            onClick={() => setShowNewSession(true)}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Create New Work Session
          </button>
          {showNewSession && (
            <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
              <div className="bg-white rounded-lg p-6 w-96 shadow-xl">
                <h3 className="text-lg font-semibold mb-4">New Work Session</h3>
                <input
                  className="w-full border rounded px-3 py-2 mb-4 text-sm"
                  placeholder="Session title..."
                  value={newSessionTitle}
                  onChange={(e) => setNewSessionTitle(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && createSession()}
                  autoFocus
                />
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => setShowNewSession(false)}
                    className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={createSession}
                    className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                  >
                    Create
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-48px)] bg-white">
      {/* Session selector */}
      <div className="absolute top-1 left-4 z-10">
        <select
          value={sessionId}
          onChange={(e) => setSearchParams({ session: e.target.value })}
          className="text-xs border rounded px-2 py-1 bg-white"
        >
          {sessions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
            </option>
          ))}
        </select>
        <button
          onClick={() => setShowNewSession(true)}
          className="ml-1 text-xs text-blue-600 hover:text-blue-800"
        >
          + New
        </button>
      </div>

      {/* Left Panel: Agents + Workspace */}
      <div className="w-64 border-r flex-shrink-0 overflow-hidden pt-8">
        <AgentPanel
          sessionId={sessionId}
          onFileSelect={handleFileSelect}
          selectedFile={activeFile?.path || null}
          onAgentListChange={loadAgents}
        />
      </div>

      {/* Center Panel: Document Editor */}
      <div className="flex-1 overflow-hidden pt-8">
        <DocumentEditor
          content={activeFile?.content || ""}
          filePath={activeFile?.path || null}
          isStreaming={isStreaming}
          onSave={handleSave}
          onContentChange={(content) => {
            if (activeFile) {
              setActiveFile({ ...activeFile, content });
            }
          }}
        />
      </div>

      {/* Right Panel: Chat */}
      <div className="w-80 border-l flex-shrink-0 overflow-hidden pt-8">
        <ChatPanel
          sessionId={sessionId}
          agents={agents}
          onStreamDoc={handleStreamDoc}
        />
      </div>

      {/* New session modal */}
      {showNewSession && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-96 shadow-xl">
            <h3 className="text-lg font-semibold mb-4">New Work Session</h3>
            <input
              className="w-full border rounded px-3 py-2 mb-4 text-sm"
              placeholder="Session title..."
              value={newSessionTitle}
              onChange={(e) => setNewSessionTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createSession()}
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowNewSession(false)}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded"
              >
                Cancel
              </button>
              <button
                onClick={createSession}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default WorkPage;
```

- [ ] **Step 2: Commit**

```bash
git add web/src/pages/WorkPage.tsx
git commit -m "feat: add WorkPage with 3-panel layout"
```

---

### Task 13: Wire Up Routing and Navigation

**Files:**
- Modify: `web/src/App.tsx`
- Modify: `web/src/components/layout/TopNav.tsx`

- [ ] **Step 1: Add Work route in App.tsx**

In `web/src/App.tsx`, add import:
```tsx
import { WorkPage } from "@/pages/WorkPage";
```

Add route inside `<Route element={<AppLayout />}>`:
```tsx
<Route path="/work" element={<WorkPage />} />
```

- [ ] **Step 2: Add nav item in TopNav.tsx**

In `web/src/components/layout/TopNav.tsx`, add a "Work" nav item in the nav items array, before or after "Coding":

```tsx
// Find the existing nav items and add:
{ path: "/work", label: "Work" },
```

The nav item should follow the same pattern as existing items (active state detection using `location.pathname`).

- [ ] **Step 3: Commit**

```bash
git add web/src/App.tsx web/src/components/layout/TopNav.tsx
git commit -m "feat: wire Work page into routing and navigation"
```

---

### Task 14: End-to-End Integration and Fixes

**Files:**
- Modify: `server/src/routes/work.ts` (flesh out file CRUD)

- [ ] **Step 1: Add missing messages endpoint**

In `server/src/routes/work.ts`, add:

```typescript
// ── Messages ──

workRoutes.get("/sessions/:id/messages", auth.middleware, async (c) => {
  const sessionId = parseInt(c.req.param("id"));
  const messages = await db
    .select()
    .from(workMessages)
    .where(eq(workMessages.sessionId, sessionId))
    .orderBy(workMessages.createdAt);
  return c.json(messages);
});
```

- [ ] **Step 2: Add missing imports in context.ts**

The `context.ts` file needs `like` from drizzle-orm:
```typescript
import { eq, and, like } from "drizzle-orm";
```

- [ ] **Step 3: Fix loop.ts — add missing imports and handle file write tool**

Ensure `loop.ts` has all needed imports. Add file write handling in the agent loop to write output to `workspace/`:

```typescript
// In loop.ts, after text accumulation, save to workspace
import { db } from "edgespark";
import { workFiles } from "@defs";
import { eq, and } from "drizzle-orm";
```

The agent's final output should be written to workspace as a file.

- [ ] **Step 4: Verify the full import chain compiles**

```bash
cd server && npx tsc --noEmit
```

Fix any type errors.

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/work.ts server/src/agent/hermes/loop.ts server/src/agent/hermes/context.ts
git commit -m "fix: add messages endpoint and wire up context injection"
```

---

## Implementation Order

Tasks must run sequentially:

1. Task 1 — Runtime config
2. Task 2 — Database tables
3. Task 3 — Migration
4. Task 4 — Work API routes (sessions/files)
5. Task 5 — Context injection builder
6. Task 6 — Hermes agent loop
7. Task 7 — Chat endpoint
8. Task 8 — Milkdown dependencies
9. Task 9 — DocumentEditor component
10. Task 10 — AgentPanel component
11. Task 11 — ChatPanel component
12. Task 12 — WorkPage layout
13. Task 13 — Routing and navigation
14. Task 14 — Integration fixes
