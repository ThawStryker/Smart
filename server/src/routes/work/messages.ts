import { Hono } from "hono";
import { db } from "edgespark";
import { auth } from "edgespark/http";
import { eq, and, asc } from "drizzle-orm";
import { workMessages, workSessions } from "@defs";

export const messagesRoutes = new Hono();

messagesRoutes.get("/", async (c) => {
  const userId = auth.user!.id;
  const sessionId = parseInt(c.req.param("id") || "0");
  const [session] = await db.select({ id: workSessions.id }).from(workSessions)
    .where(and(eq(workSessions.id, sessionId), eq(workSessions.userId, userId)));
  if (!session) return c.json({ error: "Not found" }, 404);

  const messages = await db.select().from(workMessages)
    .where(eq(workMessages.sessionId, sessionId))
    .orderBy(asc(workMessages.createdAt), asc(workMessages.id));
  return c.json(messages.map((m) => {
    let timeline: unknown[] = [];
    if (m.timelineJson) {
      try { timeline = JSON.parse(m.timelineJson); } catch { timeline = []; }
    }
    return { ...m, timeline };
  }));
});
