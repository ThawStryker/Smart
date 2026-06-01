import { Hono } from "hono";
import { db } from "edgespark";
import { auth } from "edgespark/http";
import { eq } from "drizzle-orm";
import { workSessions, workMessages } from "@defs";
import { createPhaseSSEStream, SSE_HEADERS } from "../../agent/stream";
import { run } from "../../agent/mose/engine";
import { getAll, getOpenAITools } from "../../agent/mose/tools";
import { getModel, DEFAULTS } from "../../models";
import type { EngineInput, ToolHandler } from "../../agent/mose/phases";

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

  // 从 registry 组装 toolHandlers
  const toolHandlers: Record<string, ToolHandler> = {};
  for (const tool of getAll()) {
    toolHandlers[tool.name] = {
      execute: (args) => tool.handler(args, { sessionId, userId, agentName: targetAgent }),
      phase: tool.phase,
      meta: tool.meta,
    };
  }

  const input: EngineInput = {
    sessionId,
    userId,
    userMessage: cleanMessage,
    targetAgent,
    modelConfig,
    toolHandlers,
    toolDefs: getOpenAITools(),
  };

  const events = run(input);
  const stream = createPhaseSSEStream(events);

  return new Response(stream, { headers: SSE_HEADERS });
});
