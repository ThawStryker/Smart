import { Hono } from "hono";
import { db } from "edgespark";
import { auth } from "edgespark/http";
import { eq, desc } from "drizzle-orm";
import { workSessions, workMessages } from "@defs";

export const sessionsRoutes = new Hono();

sessionsRoutes.get("/", async (c) => {
  const userId = auth.user!.id;
  const sessions = await db.select().from(workSessions)
    .where(eq(workSessions.userId, userId))
    .orderBy(desc(workSessions.createdAt));
  return c.json(sessions.filter((s) => !s.deletedAt));
});

sessionsRoutes.post("/", async (c) => {
  const userId = auth.user!.id;
  const { title } = await c.req.json<{ title?: string }>();
  const [session] = await db.insert(workSessions).values({ userId, title: title || "New Work" }).returning();
  return c.json(session, 201);
});

sessionsRoutes.get("/:id", async (c) => {
  const id = parseInt(c.req.param("id"));
  const sessions = await db.select().from(workSessions).where(eq(workSessions.id, id));
  const session = sessions[0];
  if (!session) return c.json({ error: "Not found" }, 404);
  return c.json(session);
});

sessionsRoutes.patch("/:id", async (c) => {
  const id = parseInt(c.req.param("id"));
  const body = await c.req.json<{ title?: string; stateJson?: string }>();
  const updates: Record<string, any> = {};
  if (body.title !== undefined) updates.title = body.title;
  if (body.stateJson !== undefined) updates.stateJson = body.stateJson;
  if (Object.keys(updates).length > 0) {
    updates.updatedAt = new Date().toISOString();
    await db.update(workSessions).set(updates).where(eq(workSessions.id, id));
  }
  return c.json({ ok: true });
});

sessionsRoutes.delete("/:id", async (c) => {
  const id = parseInt(c.req.param("id"));
  // 软删除：标记 deletedAt，不清除数据
  await db.update(workSessions).set({ deletedAt: new Date().toISOString() }).where(eq(workSessions.id, id));
  return c.json({ ok: true });
});
