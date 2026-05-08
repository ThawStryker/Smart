import { Hono } from "hono";
import { db, storage, secret, vars, ctx } from "edgespark";
import { auth } from "edgespark/http";
import { eq, and } from "drizzle-orm";
import { projects, tools, executionSteps, buckets } from "@defs";
import { streamText, tool, jsonSchema, stepCountIs } from "ai";
import { createOpenAI } from "@ai-sdk/openai";

// Claude Code architecture: tool-use agent loop adapted for Workers.
// Uses DeepSeek (primary) or Seed-2.0-pro (optional) via OpenAI-compatible API.

export const agentRoutes = new Hono()
  .post("/:projectId/generate", async (c) => {
    const userId = auth.user!.id;
    const projectId = parseInt(c.req.param("projectId"), 10);

    const [project] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.userId, userId)));
    if (!project) return c.json({ error: "Project not found" }, 404);

    const body = await c.req.json<{ message: string; model?: "deepseek" | "seed" }>();
    if (!body.message?.trim()) return c.json({ error: "Message required" }, 400);

    // Select model provider
    const modelChoice = body.model || "deepseek";
    let baseURL: string;
    let apiKey: string | null;
    let modelName: string;

    if (modelChoice === "seed") {
      baseURL = vars.get("SEED_BASE_URL") || "https://ark.cn-beijing.volces.com/api/v3";
      apiKey = secret.get("SEED_API_KEY");
      modelName = "seed-2.0-pro";
    } else {
      baseURL = vars.get("DEEPSEEK_BASE_URL") || "https://api.deepseek.com";
      apiKey = secret.get("DEEPSEEK_API_KEY");
      modelName = "deepseek-chat";
    }

    if (!apiKey) return c.json({ error: `${modelChoice === "seed" ? "Seed" : "DeepSeek"} API key not configured` }, 500);

    const provider = createOpenAI({ baseURL, apiKey });

    // Find or create tool for this project
    const [existingTool] = await db
      .select()
      .from(tools)
      .where(eq(tools.projectId, projectId))
      .limit(1);

    let toolId: number;
    if (existingTool) {
      toolId = existingTool.id;
    } else {
      const [newTool] = await db
        .insert(tools)
        .values({
          projectId,
          name: `${project.name}-v1`,
          version: "0.1.0",
          status: "building",
        })
        .returning();
      toolId = newTool!.id;
    }

    const prefix = `${projectId}/${toolId}/`;

    const result = streamText({
      model: provider(modelName),
      system:
        "你是一个编程 Agent，架构参考 Claude Code。你拥有文件读写和执行步骤管理的能力。请自主规划任务、生成代码、记录步骤。始终用中文交流。",
      messages: [{ role: "user", content: body.message.trim() }],
      stopWhen: stepCountIs(10),
      tools: {
        writeFile: tool({
          description: "写入代码文件到项目存储",
          inputSchema: jsonSchema({
            type: "object",
            properties: {
              path: { type: "string", description: "文件路径，如 src/index.html" },
              content: { type: "string", description: "文件内容" },
            },
            required: ["path", "content"],
          }),
          execute: async ({ path, content }) => {
            const encoder = new TextEncoder();
            await storage.from(buckets.sourceBuckets).put(prefix + path, encoder.encode(content as string));
            return `File written: ${path}`;
          },
        }),
        readFile: tool({
          description: "读取项目中的文件",
          inputSchema: jsonSchema({
            type: "object",
            properties: {
              path: { type: "string", description: "文件路径" },
            },
            required: ["path"],
          }),
          execute: async ({ path }) => {
            const obj = await storage.from(buckets.sourceBuckets).get(prefix + (path as string));
            if (!obj) return "File not found";
            return new TextDecoder().decode(obj.body);
          },
        }),
        listFiles: tool({
          description: "列出项目中的所有文件",
          inputSchema: jsonSchema({
            type: "object",
            properties: {},
          }),
          execute: async () => {
            const result = await storage.from(buckets.sourceBuckets).list({ prefix });
            return result.files.map((f) => f.path.replace(prefix, "")).join("\n") || "(empty)";
          },
        }),
        createStep: tool({
          description: "创建一个执行步骤记录",
          inputSchema: jsonSchema({
            type: "object",
            properties: {
              stepType: { type: "string", description: "步骤类型" },
              title: { type: "string", description: "步骤标题" },
              detail: { type: "string", description: "步骤详情" },
            },
            required: ["stepType", "title"],
          }),
          execute: async ({ stepType, title, detail }) => {
            const existingSteps = await db
              .select()
              .from(executionSteps)
              .where(eq(executionSteps.toolId, toolId));
            const [step] = await db
              .insert(executionSteps)
              .values({
                toolId,
                stepOrder: existingSteps.length + 1,
                type: stepType as string,
                title: title as string,
                detail: (detail as string) ?? null,
                status: "running",
                startedAt: new Date().toISOString(),
              })
              .returning();
            return `Step #${step!.id} - ${title} created (running)`;
          },
        }),
        updateStep: tool({
          description: "更新执行步骤的状态和终端输出",
          inputSchema: jsonSchema({
            type: "object",
            properties: {
              stepId: { type: "number", description: "步骤 ID" },
              status: { type: "string", description: "新状态: running, completed, failed" },
              terminalOutput: { type: "string", description: "终端输出内容" },
            },
            required: ["stepId", "status"],
          }),
          execute: async ({ stepId, status, terminalOutput }) => {
            await db
              .update(executionSteps)
              .set({
                status: status as string,
                terminalOutput: (terminalOutput as string) ?? null,
                completedAt: status === "completed" || status === "failed" ? new Date().toISOString() : null,
              })
              .where(eq(executionSteps.id, stepId as number));
            return `Step #${stepId} updated to ${status}`;
          },
        }),
      },
    });

    ctx.runInBackground(
      (async () => {
        await db
          .update(tools)
          .set({ status: "completed" })
          .where(eq(tools.id, toolId));
      })()
    );

    return result.toTextStreamResponse();
  });
