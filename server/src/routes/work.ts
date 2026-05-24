import { Hono } from "hono";
import { db, vars, secret, ctx } from "edgespark";
import { auth } from "edgespark/http";
import { eq, and, like } from "drizzle-orm";
import { workSessions, workFiles, workMessages } from "@defs";
import { createSSEStream, SSE_HEADERS } from "../agent/stream";
import { hermesLoop } from "../agent/hermes/loop";

export const workRoutes = new Hono();

// ── Sessions ──

workRoutes.get("/sessions", async (c) => {
  const userId = auth.user!.id;
  const sessions = await db
    .select()
    .from(workSessions)
    .where(eq(workSessions.userId, userId));
  return c.json(sessions);
});

workRoutes.post("/sessions", async (c) => {
  const userId = auth.user!.id;
  const { title } = await c.req.json<{ title?: string }>();
  const [session] = await db
    .insert(workSessions)
    .values({ userId, title: title || "New Work" })
    .returning();
  return c.json(session, 201);
});

workRoutes.get("/sessions/:id", async (c) => {
  const id = parseInt(c.req.param("id"));
  const sessions = await db.select().from(workSessions).where(eq(workSessions.id, id));
  const session = sessions[0];
  if (!session) return c.json({ error: "Not found" }, 404);
  return c.json(session);
});

workRoutes.delete("/sessions/:id", async (c) => {
  const id = parseInt(c.req.param("id"));
  await db.delete(workFiles).where(eq(workFiles.sessionId, id));
  await db.delete(workMessages).where(eq(workMessages.sessionId, id));
  await db.delete(workSessions).where(eq(workSessions.id, id));
  return c.json({ ok: true });
});

// ── Files ──

workRoutes.get("/sessions/:id/files", async (c) => {
  const sessionId = parseInt(c.req.param("id"));
  const prefix = c.req.query("prefix") || "";

  const condition = prefix
    ? and(eq(workFiles.sessionId, sessionId), like(workFiles.path, `${prefix}%`))
    : eq(workFiles.sessionId, sessionId);

  const files = await db
    .select()
    .from(workFiles)
    .where(condition);
  return c.json(files);
});

function extractFilePath(c: any, sessionId: number): string {
  const path = c.req.path; // "/sessions/1/files/agents/test/AGENTS.md"
  const prefix = `/sessions/${sessionId}/files/`;
  const idx = path.indexOf(prefix);
  if (idx === -1) return "";
  return decodeURIComponent(path.slice(idx + prefix.length));
}

workRoutes.get("/sessions/:id/files/*", async (c) => {
  const sessionId = parseInt(c.req.param("id"));
  const filePath = extractFilePath(c, sessionId);
  if (!filePath) return c.json({ error: "File path required" }, 400);
  const rows = await db
    .select()
    .from(workFiles)
    .where(and(eq(workFiles.sessionId, sessionId), eq(workFiles.path, filePath)));
  const file = rows[0];
  if (!file) return c.json({ error: "Not found" }, 404);
  return c.json(file);
});

workRoutes.put("/sessions/:id/files/*", async (c) => {
  const sessionId = parseInt(c.req.param("id"));
  const filePath = extractFilePath(c, sessionId);
  if (!filePath) return c.json({ error: "File path required" }, 400);
  const { content, isFolder } = await c.req.json<{ content?: string; isFolder?: boolean }>();

  const rows = await db
    .select()
    .from(workFiles)
    .where(and(eq(workFiles.sessionId, sessionId), eq(workFiles.path, filePath)));
  const existing = rows[0];

  if (existing) {
    await db
      .update(workFiles)
      .set({
        content: content !== undefined ? content : existing.content,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(workFiles.id, existing.id));
  } else {
    await db.insert(workFiles).values({
      sessionId,
      path: filePath,
      content: content || "",
      isFolder: isFolder ? 1 : 0,
    });
  }

  // Auto-create parent folders for agent paths
  if (filePath.startsWith("agents/")) {
    const parts = filePath.split("/");
    for (let i = 1; i < parts.length; i++) {
      const parentPath = parts.slice(0, i).join("/");
      const parentRows = await db
        .select()
        .from(workFiles)
        .where(and(eq(workFiles.sessionId, sessionId), eq(workFiles.path, parentPath)));
      if (!parentRows[0]) {
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

workRoutes.delete("/sessions/:id/files/*", async (c) => {
  const sessionId = parseInt(c.req.param("id"));
  const filePath = extractFilePath(c, sessionId);
  if (!filePath) return c.json({ error: "File path required" }, 400);

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

// ── Messages ──

workRoutes.get("/sessions/:id/messages", async (c) => {
  const sessionId = parseInt(c.req.param("id"));
  const messages = await db
    .select()
    .from(workMessages)
    .where(eq(workMessages.sessionId, sessionId));
  return c.json(messages);
});

// ── Chat (Hermes orchestration) ──

workRoutes.post("/chat", async (c) => {
  const userId = auth.user!.id;
  const { sessionId, message } = await c.req.json<{ sessionId: number; message: string }>();

  // Validate session exists
  const sessions = await db.select().from(workSessions).where(eq(workSessions.id, sessionId));
  const session = sessions[0];
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

  // Load all files for agent listing
  const allFiles = await db
    .select()
    .from(workFiles)
    .where(eq(workFiles.sessionId, sessionId));

  // Model config: lite for Hermes, pro for sub-agents
  const isAgent = !!targetAgent;
  const baseURL = isAgent
    ? (vars.get("SEED_PRO_BASE_URL") || "https://ark.cn-beijing.volces.com/api/v3")
    : (vars.get("SEED_LITE_BASE_URL") || "https://ark.cn-beijing.volces.com/api/v3");
  const apiKey = isAgent
    ? (secret.get("SEED_PRO_API_KEY") || "")
    : (secret.get("SEED_LITE_API_KEY") || "");
  const modelName = isAgent ? "doubao-seed-2-0-pro-260215" : "doubao-seed-2-0-lite-260428";

  const modelConfig = {
    baseURL,
    apiPath: "/chat/completions",
    apiKey,
    modelName,
  };

  // Create event queue and SSE stream
  const eventQueue: Array<Record<string, unknown>> = [];
  const stream = createSSEStream(eventQueue);

  // Run Hermes loop in background
  ctx.runInBackground((async () => {
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
  })());

  return new Response(stream, { headers: SSE_HEADERS });
});
