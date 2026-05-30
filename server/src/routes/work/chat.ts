import { Hono } from "hono";
import { db, secret, ctx } from "edgespark";
import { auth } from "edgespark/http";
import { eq } from "drizzle-orm";
import { workSessions, workMessages } from "@defs";
import { createSSEStream, SSE_HEADERS } from "../../agent/stream";
import { moseLoop } from "../../agent/mose/loop";
import { getModel, DEFAULTS } from "../../models";

export const chatRoutes = new Hono();

chatRoutes.post("/", async (c) => {
  const userId = auth.user!.id;
  const { sessionId, message } = await c.req.json<{ sessionId: number; message: string }>();

  const sessions = await db.select().from(workSessions).where(eq(workSessions.id, sessionId));
  const session = sessions[0];
  if (!session) return c.json({ error: "Session not found" }, 404);

  const mentionRegex = /@(\S+)/g;
  const mentions: string[] = [];
  let match;
  while ((match = mentionRegex.exec(message)) !== null) mentions.push(match[1]);
  const cleanMessage = message.replace(mentionRegex, "").trim();
  const targetAgent = mentions.length > 0 ? mentions[0] : null;

  await db.insert(workMessages).values({ sessionId, agentName: null, role: "user", content: message });

  const isAgent = !!targetAgent;
  const modelKey = isAgent ? DEFAULTS.agent : DEFAULTS.chat;
  const model = getModel(modelKey);
  if (!model) return c.json({ error: `Model not configured: ${modelKey}` }, 500);
  const modelConfig = { baseURL: model.baseURL, apiPath: model.apiPath, apiKey: model.apiKey, modelName: model.modelName };

  const eventQueue: Array<Record<string, unknown>> = [];
  const stream = createSSEStream(eventQueue);

  ctx.runInBackground((async () => {
    try {
      await moseLoop({ sessionId, userId, userMessage: cleanMessage, targetAgent, modelConfig, eventQueue });
    } catch (err: any) {
      eventQueue.push({ type: "error", message: err.message });
    }
    eventQueue.push({ type: "done" });
  })());

  return new Response(stream, { headers: SSE_HEADERS });
});
