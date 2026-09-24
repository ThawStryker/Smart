import { Hono } from "hono";
import { db } from "edgespark";
import { auth } from "edgespark/http";
import { eq, and } from "drizzle-orm";
import { workSessions, workMessages, userAgents, workspaceFiles } from "@defs";
import { createPhaseSSEStream, SSE_HEADERS } from "../../agent/stream";
import { run } from "../../agent/mose";
import { getModel, DEFAULTS } from "../../models";
import type { EngineInput, SavedState } from "../../agent/mose/types";
import type { PhaseEvent } from "../../agent/mose/phases";
import { applyTimelineEvent, type TimelineStep } from "../../agent/mose/timeline";
import { extractMention, stripMentions } from "../../lib/agent-name";
import { extractFileMention, stripFileMentions, toWorkspacePath, withFocusFile } from "../../lib/file-mention";

export const chatRoutes = new Hono();

chatRoutes.post("/", async (c) => {
  const userId = auth.user!.id;
  const { sessionId, message, agentName: stickyAgent, focusFile: stickyFile } = await c.req.json<{
    sessionId: number;
    message: string;
    agentName?: string;
    focusFile?: string;
  }>();

  const sessions = await db.select().from(workSessions).where(eq(workSessions.id, sessionId));
  const session = sessions[0];
  if (!session || session.userId !== userId || session.deletedAt) {
    return c.json({ error: "Session not found" }, 404);
  }

  const ownedAgents = await db.select({ name: userAgents.name }).from(userAgents)
    .where(eq(userAgents.userId, userId));
  const agentNames = ownedAgents.map((a) => a.name);
  const mentioned = extractMention(message, agentNames);
  const wsRows = await db.select({ path: workspaceFiles.path, isFolder: workspaceFiles.isFolder })
    .from(workspaceFiles).where(eq(workspaceFiles.userId, userId));
  const fileNames = wsRows.filter((f) => !f.isFolder).map((f) => f.path.replace(/^workspace\//, ""));
  const mentionedFile = extractFileMention(message, fileNames);
  let cleanMessage = mentioned ? (stripMentions(message, agentNames) || message.trim()) : message.trim();
  if (mentionedFile) cleanMessage = stripFileMentions(cleanMessage, fileNames) || cleanMessage;
  let targetAgent: string | null = mentioned;
  if (!targetAgent && stickyAgent) {
    const [owned] = await db.select({ name: userAgents.name }).from(userAgents)
      .where(and(eq(userAgents.userId, userId), eq(userAgents.name, stickyAgent)));
    if (owned) targetAgent = owned.name;
  }
  let focusFile: string | null = mentionedFile ? toWorkspacePath(mentionedFile) : null;
  if (!focusFile && stickyFile) {
    const rel = stickyFile.replace(/^workspace\//, "");
    if (fileNames.includes(rel)) focusFile = toWorkspacePath(rel);
  }
  cleanMessage = withFocusFile(cleanMessage, focusFile);

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
    focusFile,
    modelConfig,
    toolHandlers: {},
    toolDefs: [],
    // 不在引擎里存：SSE break/刷新会丢掉 yield 之后的 onSaveMessage
  };

  const engine = run(input, savedState, async (state) => {
    await db.update(workSessions)
      .set({ stateJson: JSON.stringify(state), updatedAt: new Date().toISOString() })
      .where(eq(workSessions.id, sessionId));
  });

  async function* persistAssistant(): AsyncGenerator<PhaseEvent> {
    let acc = "";
    let agentName: string | null = targetAgent;
    let saved = false;
    const timeline: TimelineStep[] = [];
    try {
      for await (const ev of engine) {
        if (ev.type === "phase" && ev.phase === "agent_start" && ev.meta?.agentName) {
          agentName = String(ev.meta.agentName);
        }
        if (ev.type === "delta" && ev.phase === "text" && ev.text) acc += ev.text;
        applyTimelineEvent(timeline, ev);
        yield ev;
      }
    } finally {
      const content = acc.trim();
      if (!saved && (content || timeline.length > 0)) {
        saved = true;
        await db.insert(workMessages).values({
          sessionId,
          agentName,
          role: "assistant",
          content: acc,
          timelineJson: timeline.length > 0 ? JSON.stringify(timeline) : null,
        });
      }
    }
  }

  const stream = createPhaseSSEStream(persistAssistant());
  return new Response(stream, { headers: SSE_HEADERS });
});
