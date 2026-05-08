import { Hono } from "hono";
import { db, storage, secret, vars, ctx } from "edgespark";
import { auth } from "edgespark/http";
import { eq, and } from "drizzle-orm";
import { projects, tools, executionSteps, buckets } from "@defs";
import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";

export const agentRoutes = new Hono()
  .post("/:projectId/generate", async (c) => {
    const userId = auth.user!.id;
    const projectId = parseInt(c.req.param("projectId"), 10);

    const [project] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.userId, userId)));
    if (!project) return c.json({ error: "Project not found" }, 404);

    const body = await c.req.json<{ message: string; model?: string }>();
    if (!body.message?.trim()) return c.json({ error: "Message required" }, 400);

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
      modelName = "deepseek-v4-pro";
    }

    if (!apiKey) return c.json({ error: "API key not configured" }, 500);

    const provider = createOpenAI({ baseURL, apiKey });

    // Find or create tool
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

    // Create initial step
    const [step] = await db
      .insert(executionSteps)
      .values({
        toolId,
        stepOrder: 1,
        type: "code_gen",
        title: `生成: ${body.message.trim().slice(0, 50)}`,
        status: "running",
        startedAt: new Date().toISOString(),
      })
      .returning();

    try {
      const { text } = await generateText({
        model: provider(modelName),
        system:
          `你是一个编程 Agent。用户提出需求，你直接生成完整的代码文件。

回复格式要求：
1. 首先简要说明你的方案（1-2句话）
2. 然后用 \`\`\`language:path 标记输出每个文件，例如：
\`\`\`html:src/index.html
<!DOCTYPE html>...
\`\`\`
\`\`\`typescript:src/main.ts
console.log("hello");
\`\`\`
3. 最后简要总结生成的文件

务必包含完整的、可运行的代码。`,
        messages: [{ role: "user", content: body.message.trim() }],
      });

      // Parse code blocks from response
      const codeBlockRegex = /```(\w+)?:?(\S+)?\n([\s\S]*?)```/g;
      const prefix = `${projectId}/${toolId}/`;
      let match;
      const files: string[] = [];

      while ((match = codeBlockRegex.exec(text)) !== null) {
        const lang = match[1] || "";
        const filePath = match[2] || `code.${lang || "txt"}`;
        const code = match[3];

        const encoder = new TextEncoder();
        await storage.from(buckets.sourceBuckets).put(prefix + filePath, encoder.encode(code));
        files.push(filePath);
      }

      // If no code blocks found, save the raw response
      if (files.length === 0) {
        const encoder = new TextEncoder();
        await storage.from(buckets.sourceBuckets).put(prefix + "output.txt", encoder.encode(text));
        files.push("output.txt");
      }

      // Update step as completed
      await db
        .update(executionSteps)
        .set({
          status: "completed",
          terminalOutput: `生成文件:\n${files.map((f) => `  - ${f}`).join("\n")}\n\n${text.slice(0, 500)}`,
          completedAt: new Date().toISOString(),
        })
        .where(eq(executionSteps.id, step!.id));

      ctx.runInBackground(
        (async () => {
          await db
            .update(tools)
            .set({ status: "completed" })
            .where(eq(tools.id, toolId));
        })()
      );

      return c.json({
        content: text,
        files,
        stepId: step!.id,
      });
    } catch (err) {
      await db
        .update(executionSteps)
        .set({
          status: "failed",
          terminalOutput: String(err),
          completedAt: new Date().toISOString(),
        })
        .where(eq(executionSteps.id, step!.id));

      return c.json({ error: "Generation failed", detail: String(err) }, 500);
    }
  });
