import { Hono } from "hono";
import { db } from "edgespark";
import { eq } from "drizzle-orm";
import { workMessages } from "@defs";

export const messagesRoutes = new Hono();

messagesRoutes.get("/", async (c) => {
  const sessionId = parseInt(c.req.param("id") || "0");
  const messages = await db.select().from(workMessages).where(eq(workMessages.sessionId, sessionId));
  return c.json(messages);
});
