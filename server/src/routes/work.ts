import { Hono } from "hono";
import { db } from "edgespark";
import { auth } from "edgespark/http";
import { eq, and, like } from "drizzle-orm";
import { workSessions, workFiles, workMessages } from "@defs";

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

workRoutes.get("/sessions/:id/files/*", async (c) => {
  const sessionId = parseInt(c.req.param("id"));
  const filePath = c.req.param("*");
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
  const filePath = c.req.param("*");
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
  const filePath = c.req.param("*");
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
