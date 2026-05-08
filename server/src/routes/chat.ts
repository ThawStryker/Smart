import { Hono } from "hono";
import { db, secret, vars } from "edgespark";
import { auth } from "edgespark/http";
import { eq, and, asc } from "drizzle-orm";
import { projects, conversations } from "@defs";
import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";

export const chatRoutes = new Hono()
  .post("/:projectId/chat", async (c) => {
    const userId = auth.user!.id;
    const projectId = parseInt(c.req.param("projectId"), 10);

    const [project] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.userId, userId)));
    if (!project) return c.json({ error: "Project not found" }, 404);

    const body = await c.req.json<{ message: string }>();
    if (!body.message?.trim()) return c.json({ error: "Message required" }, 400);

    await db.insert(conversations).values({
      projectId,
      userId,
      role: "user",
      content: body.message.trim(),
    });

    const history = await db
      .select()
      .from(conversations)
      .where(eq(conversations.projectId, projectId))
      .orderBy(asc(conversations.createdAt))
      .limit(40);

    const messages = history.map((msg) => ({
      role: msg.role as "user" | "assistant",
      content: msg.content,
    }));

    const baseURL = vars.get("DEEPSEEK_BASE_URL") || "https://api.deepseek.com";
    const apiKey = secret.get("DEEPSEEK_API_KEY");
    if (!apiKey) return c.json({ error: "DeepSeek API key not configured" }, 500);

    const deepseek = createOpenAI({
      baseURL,
      apiKey,
    });

    const { text } = await generateText({
      model: deepseek("deepseek-chat"),
      system:
        "你是一个 AI 工具开发助手，帮助用户生成代码和构建工具。请用中文回复。分析用户需求，如果需要生成代码，请建议用户触发代码生成。",
      messages,
    });

    await db.insert(conversations).values({
      projectId,
      userId,
      role: "assistant",
      content: text,
    });

    return c.json({ content: text });
  });
