import { Hono } from "hono";
import { db, secret, vars } from "edgespark";
import { auth } from "edgespark/http";
import { eq, and, asc } from "drizzle-orm";
import { projects, conversations } from "@defs";

export const chatRoutes = new Hono()
  .post("/:projectId/chat", async (c) => {
    try {
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

      const messages = [
        { role: "system", content: "你是一个 AI 工具开发助手，帮助用户生成代码和构建工具。请用中文回复。" },
        ...history.map((msg) => ({
          role: msg.role as "user" | "assistant",
          content: msg.content,
        })),
      ];

      const baseURL = vars.get("DEEPSEEK_BASE_URL") || "https://api.deepseek.com";
      const apiKey = secret.get("DEEPSEEK_API_KEY");
      if (!apiKey) return c.json({ error: "DeepSeek API key not configured" }, 500);

      const response = await fetch(`${baseURL}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "deepseek-v4-pro",
          messages,
          temperature: 0.7,
          max_tokens: 4096,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error("DeepSeek API error:", response.status, errText);
        return c.json({ error: `DeepSeek API error: ${response.status}` }, 502);
      }

      const data = await response.json() as {
        choices: Array<{ message: { content: string } }>;
      };
      const content = data.choices?.[0]?.message?.content || "";

      await db.insert(conversations).values({
        projectId,
        userId,
        role: "assistant",
        content,
      });

      return c.json({ content });
    } catch (err) {
      console.error("Chat error:", err);
      return c.json({ error: `Internal error: ${String(err)}` }, 500);
    }
  });
