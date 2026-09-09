import { Hono } from "hono";
import { db, ctx } from "edgespark";
import { auth } from "edgespark/http";
import { eq, asc } from "drizzle-orm";
import { projects, conversations, tools as toolsDef } from "@defs";
import { getModel, DEFAULTS } from "../models";
import { SSE_HEADERS, emit, createSSEStream } from "./stream";
import { buildToolList } from "./tools/registry";
import { buildSkillPrompt } from "./tools/skill";
import { buildMcpPrompt } from "./tools/mcp";
import { buildSystemMessage } from "./prompt/builder";
import { getPhase, advancePhase, setPhase, type Phase } from "./workflow";
import { buildMemoryContext, extractMemories } from "./memory/store";
import { agentLoop } from "./loop";
import type { ExecContext } from "./executor";

export const agentRoutes = new Hono()
  .post("/:projectId/vibe", async (c) => {
    const userId = auth.user!.id;
    const projectId = parseInt(c.req.param("projectId"), 10);

    const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
    if (!project) return c.json({ error: "Project not found" }, 404);

    const body = await c.req.json<{ message: string; images?: string[]; mcps?: string[]; skills?: string[] }>();
    if (!body.message?.trim() && (!body.images || body.images.length === 0)) {
      return c.json({ error: "Message required" }, 400);
    }

    const modelKey = DEFAULTS.coding;
    const model = getModel(modelKey);
    if (!model) return c.json({ error: `Model not configured: ${modelKey}` }, 500);
    const { baseURL, apiPath, apiKey, modelName } = model;
    const selectedModel = "deepseek";

    // === Save user message ===
    await db.insert(conversations).values({
      projectId, userId, role: "user",
      content: body.message?.trim() || (body.images?.length ? "[图片]" : ""),
    });

    // === Load history ===
    const history = await db.select().from(conversations)
      .where(eq(conversations.projectId, projectId))
      .orderBy(asc(conversations.createdAt)).limit(80);

    // === Workflow: determine phase ===
    const currentPhase = await getPhase(projectId);
    let phase: Phase = await advancePhase(projectId, currentPhase, body.message || "");

    // Slash command detection — force phase based on command
    const msg = body.message || "";
    if (msg.startsWith("/brainstorming")) phase = "brainstorm";
    else if (msg.startsWith("/writing-plans")) phase = "plan";
    else if (msg.startsWith("/code-review") || msg.startsWith("/verification")) phase = "verify";
    else if (msg.startsWith("/subagent-driven") || msg.startsWith("/test-driven") || msg.startsWith("/debugging") || msg.startsWith("/deploy")) phase = "execute";
    if (phase !== currentPhase) await setPhase(projectId, phase);

    // === Build system prompt ===
    const memoryCtx = await buildMemoryContext(userId, projectId);

    // Detect skill trigger from slash command: /<skill-name>
    let triggerSkill: string | undefined;
    const selected = body.skills || [];
    if (body.message) {
      for (const s of selected) {
        const slug = "/" + s.toLowerCase().replace(/\s+/g, "-");
        if (body.message.startsWith(slug)) {
          triggerSkill = s;
          break;
        }
      }
    }
    const skillCtx = await buildSkillPrompt(selected, selectedModel, triggerSkill);
    const selectedMcps = (body.mcps || []).filter(Boolean);
    const mcpCtx = await buildMcpPrompt(selectedMcps);

    const systemMsg = buildSystemMessage(phase, memoryCtx, skillCtx, mcpCtx);

    // === Build messages ===
    const apiMessages: Array<Record<string, unknown>> = [systemMsg];
    for (const msg of history) {
      if (msg.role === "user") apiMessages.push({ role: "user", content: msg.content });
      else if (msg.role === "assistant") apiMessages.push({ role: "assistant", content: msg.content });
    }

    // === Images ===
    if ((body.images || []).length > 0) {
      for (let i = apiMessages.length - 1; i >= 0; i--) {
        if (apiMessages[i].role === "user") {
          const text = apiMessages[i].content as string;
          const content: Array<Record<string, unknown>> = [{ type: "text", text }];
          for (const img of body.images!) content.push({ type: "image_url", image_url: { url: img } });
          apiMessages[i] = { role: "user", content };
          break;
        }
      }
    }

    // === Build tools ===
    const { tools: activeTools, mcpMap } = await buildToolList(phase, selectedMcps);

    // === Find or create tool record ===
    const [existingTool] = await db.select().from(toolsDef).where(eq(toolsDef.projectId, projectId)).limit(1);
    let toolId = existingTool?.id;
    if (!toolId) {
      const [nt] = await db.insert(toolsDef).values({
        projectId, name: `${project.name}-v1`, version: "0.1.0", status: "building",
      }).returning();
      toolId = nt!.id;
    }

    const prefix = `${projectId}/${toolId}/`;
    const eventQueue: Array<Record<string, unknown>> = [];
    const generatedFiles: Array<{ path: string; language: string }> = [];

    const execCtx: ExecContext = { prefix, toolId, eventQueue, generatedFiles };

    // === SSE Stream ===
    const stream = createSSEStream(eventQueue);

    // === Background agent ===
    const agentPromise = (async () => {
      let fullResponse = "";
      let savedConvId: number | null = null;
      try {
        const result = await agentLoop({
          baseURL, apiPath, apiKey, modelName, selectedModel,
          initialMessages: apiMessages,
          activeTools, mcpMap, execCtx,
          userId, projectId, eventQueue,
        });
        fullResponse = result.fullResponse;
        savedConvId = result.savedConvId;

        // Save final response
        if (savedConvId) {
          await db.update(conversations).set({ content: fullResponse || "任务完成" }).where(eq(conversations.id, savedConvId));
        } else {
          await db.insert(conversations).values({ projectId, userId, role: "assistant", content: fullResponse || "任务完成" });
        }

        // Update tool status
        ctx.runInBackground((async () => {
          await db.update(toolsDef).set({
            status: "completed",
            metadata: generatedFiles.length > 0 ? JSON.stringify(generatedFiles) : null,
          }).where(eq(toolsDef.id, toolId));
        })());

        // Extract memories
        ctx.runInBackground((async () => {
          try { await extractMemories(userId, projectId, body.message || "", fullResponse); } catch {}
        })());

        // Phase transition hints are handled by the phase-specific prompts

        emit(eventQueue, { type: "done", toolId });
      } catch (err) {
        if (savedConvId && fullResponse) {
          try { await db.update(conversations).set({ content: fullResponse }).where(eq(conversations.id, savedConvId)); } catch {}
        }
        emit(eventQueue, { type: "error", content: String(err) });
        emit(eventQueue, { type: "done" });
      }
    })();

    ctx.runInBackground(agentPromise);
    return new Response(stream, { headers: SSE_HEADERS });
  });
