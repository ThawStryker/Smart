import { Hono } from "hono";
import { db, secret, vars, ctx } from "edgespark";
import { auth } from "edgespark/http";
import { eq, and, desc } from "drizzle-orm";
import { workAgents, workConversations, userProfiles } from "@defs";
import { SSE_HEADERS, emit, createSSEStream } from "../agent/stream";

export const workRoutes = new Hono()
  .get("/api/work/agents", async (c) => {
    const userId = auth.user!.id;
    const rows = await db
      .select()
      .from(workAgents)
      .where(eq(workAgents.userId, userId))
      .orderBy(desc(workAgents.createdAt));
    return c.json(rows);
  })
  .post("/api/work/agents", async (c) => {
    const userId = auth.user!.id;
    const body = await c.req.json<{
      name: string; role?: string; systemPrompt?: string; tools?: string; skills?: string;
    }>();
    if (!body.name) return c.json({ error: "name required" }, 400);
    const [row] = await db.insert(workAgents).values({
      userId,
      name: body.name,
      role: body.role || "custom",
      systemPrompt: body.systemPrompt || "",
      tools: body.tools || "read,write,edit,list,grep",
      skills: body.skills || "",
    }).returning();
    return c.json(row, 201);
  })
  .patch("/api/work/agents/:id", async (c) => {
    const userId = auth.user!.id;
    const id = parseInt(c.req.param("id"), 10);
    const [existing] = await db.select().from(workAgents).where(and(eq(workAgents.id, id), eq(workAgents.userId, userId)));
    if (!existing) return c.json({ error: "Not found" }, 404);
    const body = await c.req.json<{
      name?: string; role?: string; systemPrompt?: string; tools?: string; skills?: string;
    }>();
    await db.update(workAgents).set({ ...body, updatedAt: new Date().toISOString() }).where(eq(workAgents.id, id));
    return c.json({ success: true });
  })
  .delete("/api/work/agents/:id", async (c) => {
    const userId = auth.user!.id;
    const id = parseInt(c.req.param("id"), 10);
    const [existing] = await db.select().from(workAgents).where(and(eq(workAgents.id, id), eq(workAgents.userId, userId)));
    if (!existing) return c.json({ error: "Not found" }, 404);
    await db.delete(workAgents).where(eq(workAgents.id, id));
    return c.json({ success: true });
  })
  .get("/api/work/conversations", async (c) => {
    const userId = auth.user!.id;
    const rows = await db.select().from(workConversations)
      .where(eq(workConversations.userId, userId)).orderBy(desc(workConversations.updatedAt));
    return c.json(rows.map(r => ({ id: r.id, title: r.title, createdAt: r.createdAt, updatedAt: r.updatedAt })));
  })
  .get("/api/work/conversations/:id", async (c) => {
    const userId = auth.user!.id;
    const id = parseInt(c.req.param("id"), 10);
    const [row] = await db.select().from(workConversations).where(and(eq(workConversations.id, id), eq(workConversations.userId, userId)));
    if (!row) return c.json({ error: "Not found" }, 404);
    return c.json(row);
  })
  .post("/api/work/conversations", async (c) => {
    const userId = auth.user!.id;
    const [row] = await db.insert(workConversations).values({ userId, title: "新对话", messagesJson: "[]", model: "seed-pro" }).returning();
    return c.json(row, 201);
  })
  .patch("/api/work/conversations/:id", async (c) => {
    const userId = auth.user!.id;
    const id = parseInt(c.req.param("id"), 10);
    const body = await c.req.json<{ title?: string; messagesJson?: string }>();
    await db.update(workConversations).set({ ...body, updatedAt: new Date().toISOString() })
      .where(and(eq(workConversations.id, id), eq(workConversations.userId, userId)));
    return c.json({ success: true });
  })
  .delete("/api/work/conversations/:id", async (c) => {
    const userId = auth.user!.id;
    const id = parseInt(c.req.param("id"), 10);
    await db.delete(workConversations).where(and(eq(workConversations.id, id), eq(workConversations.userId, userId)));
    return c.json({ success: true });
  })
  .post("/api/work/chat", async (c) => {
    const userId = auth.user!.id;
    const body = await c.req.json<{ message: string; model?: string; systemPrompt?: string; tools?: string }>();
    if (!body.message?.trim()) return c.json({ error: "Message required" }, 400);

    const isAdmin = await db.select().from(userProfiles).where(eq(userProfiles.userId, userId)).then(r => r[0]?.role === "admin");
    let selectedModel = body.model || "seed";
    if (selectedModel === "deepseek" && !isAdmin) selectedModel = "seed";

    let baseURL: string, apiKey: string | null, modelName: string;
    if (selectedModel === "deepseek") {
      baseURL = vars.get("DEEPSEEK_BASE_URL") || "https://api.deepseek.com";
      apiKey = secret.get("DEEPSEEK_API_KEY");
      modelName = "deepseek-v4-pro";
    } else if (selectedModel === "seed-pro") {
      baseURL = vars.get("SEED_BASE_URL") || "https://ark.cn-beijing.volces.com/api/v3";
      apiKey = secret.get("SEED_API_KEY");
      modelName = "doubao-seed-2-0-pro-260215";
    } else {
      baseURL = vars.get("SEED_BASE_URL") || "https://ark.cn-beijing.volces.com/api/v3";
      apiKey = secret.get("SEED_API_KEY");
      modelName = "doubao-seed-2-0-code-preview-260215";
    }
    if (!apiKey) return c.json({ error: "API key not configured" }, 500);
    const apiPath = selectedModel === "deepseek" ? "/v1/chat/completions" : "/chat/completions";

    const systemContent = body.systemPrompt || "你是一个 AI 助手。";
    const messages: Array<Record<string, unknown>> = [
      { role: "system", content: systemContent },
      { role: "user", content: body.message },
    ];

    const eventQueue: Array<Record<string, unknown>> = [];
    const stream = createSSEStream(eventQueue);

    ctx.runInBackground((async () => {
      try {
        const reqBody: Record<string, unknown> = {
          model: modelName, messages, temperature: 0.5, max_tokens: 4096, stream: true,
        };
        if (selectedModel === "deepseek") reqBody.reasoning_effort = "high";

        const res = await fetch(`${baseURL}${apiPath}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify(reqBody),
        });
        if (!res.ok) {
          emit(eventQueue, { type: "error", content: `API ${res.status}` });
          emit(eventQueue, { type: "done" });
          return;
        }

        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6).trim();
            if (data === "[DONE]") continue;
            try {
              const parsed = JSON.parse(data);
              const delta = parsed.choices?.[0]?.delta;
              if (delta?.content) emit(eventQueue, { type: "text", content: delta.content });
              if (delta?.reasoning_content) emit(eventQueue, { type: "thinking", content: delta.reasoning_content });
            } catch {}
          }
        }
        emit(eventQueue, { type: "done" });
      } catch (err) {
        emit(eventQueue, { type: "error", content: String(err) });
        emit(eventQueue, { type: "done" });
      }
    })());

    return new Response(stream, { headers: SSE_HEADERS });
  });
