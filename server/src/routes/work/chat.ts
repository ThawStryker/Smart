import { Hono } from "hono";
import { db, vars, secret, ctx } from "edgespark";
import { auth } from "edgespark/http";
import { eq } from "drizzle-orm";
import { workSessions, workMessages } from "@defs";
import { createSSEStream, SSE_HEADERS } from "../../agent/stream";
import { hermesLoop } from "../../agent/hermes/loop";

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
  const modelConfig = {
    baseURL: isAgent ? (vars.get("SEED_PRO_BASE_URL") || "https://ark.cn-beijing.volces.com/api/v3") : (vars.get("SEED_LITE_BASE_URL") || "https://ark.cn-beijing.volces.com/api/v3"),
    apiPath: "/chat/completions",
    apiKey: isAgent ? (secret.get("SEED_PRO_API_KEY") || "") : (secret.get("SEED_LITE_API_KEY") || ""),
    modelName: isAgent ? "doubao-seed-2-0-pro-260215" : "doubao-seed-2-0-lite-260428",
  };

  const eventQueue: Array<Record<string, unknown>> = [];
  const stream = createSSEStream(eventQueue);

  ctx.runInBackground((async () => {
    try {
      await hermesLoop({ sessionId, userId, userMessage: cleanMessage, targetAgent, modelConfig, eventQueue });
    } catch (err: any) {
      eventQueue.push({ type: "error", message: err.message });
    }
    eventQueue.push({ type: "done" });
  })());

  return new Response(stream, { headers: SSE_HEADERS });
});
