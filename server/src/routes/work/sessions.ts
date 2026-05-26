import { Hono } from "hono";
import { db } from "edgespark";
import { auth } from "edgespark/http";
import { eq } from "drizzle-orm";
import { workSessions, workFiles, workMessages } from "@defs";

export const sessionsRoutes = new Hono();

sessionsRoutes.get("/", async (c) => {
  const userId = auth.user!.id;
  const sessions = await db.select().from(workSessions).where(eq(workSessions.userId, userId));
  return c.json(sessions);
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
  const { title } = await c.req.json<{ title: string }>();
  await db.update(workSessions).set({ title }).where(eq(workSessions.id, id));
  return c.json({ ok: true });
});

sessionsRoutes.delete("/:id", async (c) => {
  const id = parseInt(c.req.param("id"));
  await db.delete(workMessages).where(eq(workMessages.sessionId, id));
  await db.delete(workSessions).where(eq(workSessions.id, id));
  return c.json({ ok: true });
});
