import { Hono } from "hono";
import { db } from "edgespark";
import { auth } from "edgespark/http";
import { eq } from "drizzle-orm";
import { workSessions, workMessages } from "@defs";
import { createPhaseSSEStream, SSE_HEADERS } from "../../agent/stream";
import { run } from "../../agent/mose";
import { getModel, DEFAULTS } from "../../models";
import type { EngineInput, SavedState } from "../../agent/mose/types";

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

  // 加载之前保存的跨轮状态
  let savedState: SavedState | undefined;
  if (session.stateJson) {
    try { savedState = JSON.parse(session.stateJson); } catch {}
  }

  const input: EngineInput = {
    sessionId,
    userId,
    userMessage: cleanMessage,
    targetAgent,
    modelConfig,
    toolHandlers: {},
    toolDefs: [],
    onSaveMessage: async (msg) => {
      await db.insert(workMessages).values(msg);
    },
  };

  const events = run(input, savedState, async (state) => {
    await db.update(workSessions)
      .set({ stateJson: JSON.stringify(state), updatedAt: new Date().toISOString() })
      .where(eq(workSessions.id, sessionId));
  });

  const stream = createPhaseSSEStream(events);
  return new Response(stream, { headers: SSE_HEADERS });
});
