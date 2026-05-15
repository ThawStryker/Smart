import { Hono } from "hono";
import { db, secret, vars, ctx } from "edgespark";
import { auth } from "edgespark/http";
import { eq, and, desc } from "drizzle-orm";
import { workAgents, workConversations, userProfiles } from "@defs";

export const workRoutes = new Hono()
  .get("/api/work/agents", async (c) => {
    const userId = auth.user!.id;
    const rows = await db.select().from(workAgents).where(eq(workAgents.userId, userId)).orderBy(desc(workAgents.createdAt));
    return c.json(rows);
  })
  .post("/api/work/agents", async (c) => {
    const userId = auth.user!.id;
    const body = await c.req.json<{ name: string; role?: string; systemPrompt?: string; tools?: string; skills?: string }>();
    if (!body.name) return c.json({ error: "name required" }, 400);
    const [row] = await db.insert(workAgents).values({ userId, name: body.name, role: body.role || "custom", systemPrompt: body.systemPrompt || "", tools: body.tools || "read,write,edit,list,grep", skills: body.skills || "" }).returning();
    return c.json(row, 201);
  })
  .patch("/api/work/agents/:id", async (c) => {
    const userId = auth.user!.id;
    const id = parseInt(c.req.param("id"), 10);
    const body = await c.req.json<{ name?: string; role?: string; systemPrompt?: string; tools?: string; skills?: string }>();
    await db.update(workAgents).set({ ...body, updatedAt: new Date().toISOString() }).where(and(eq(workAgents.id, id), eq(workAgents.userId, userId)));
    return c.json({ success: true });
  })
  .delete("/api/work/agents/:id", async (c) => {
    const userId = auth.user!.id;
    const id = parseInt(c.req.param("id"), 10);
    await db.delete(workAgents).where(and(eq(workAgents.id, id), eq(workAgents.userId, userId)));
    return c.json({ success: true });
  })
  .get("/api/work/conversations", async (c) => {
    const userId = auth.user!.id;
    const rows = await db.select().from(workConversations).where(eq(workConversations.userId, userId)).orderBy(desc(workConversations.updatedAt));
    return c.json(rows.map(r => ({ id: r.id, title: r.title, createdAt: r.createdAt })));
  })
  .post("/api/work/conversations", async (c) => {
    const userId = auth.user!.id;
    const [row] = await db.insert(workConversations).values({ userId }).returning();
    return c.json(row, 201);
  })
  .delete("/api/work/conversations/:id", async (c) => {
    const userId = auth.user!.id;
    const id = parseInt(c.req.param("id"), 10);
    await db.delete(workConversations).where(and(eq(workConversations.id, id), eq(workConversations.userId, userId)));
    return c.json({ success: true });
  })
  .post("/api/work/chat", async (c) => {
    const body = await c.req.json<{ message: string; model?: string; systemPrompt?: string }>();
    if (!body.message?.trim()) return c.json({ error: "Message required" }, 400);

    const selectedModel = body.model || "seed-pro";
    const baseURL = vars.get("SEED_BASE_URL") || "https://ark.cn-beijing.volces.com/api/v3";
    const apiKey = secret.get("SEED_API_KEY");
    const modelName = selectedModel === "deepseek" ? "deepseek-v4-pro" : selectedModel === "seed-pro" ? "doubao-seed-2-0-pro-260215" : "doubao-seed-2-0-code-preview-260215";
    if (!apiKey) return c.json({ error: "API key not configured" }, 500);

    const messages = [
      { role: "system", content: body.systemPrompt || "你是一个 AI 助手。" },
      { role: "user", content: body.message },
    ];

    let ctrl: ReadableStreamDefaultController;
    const stream = new ReadableStream({ start(c) { ctrl = c; } });
    const encoder = new TextEncoder();
    const send = (d: Record<string, unknown>) => { try { ctrl.enqueue(encoder.encode(`data: ${JSON.stringify(d)}\n\n`)); } catch {} };

    ctx.runInBackground((async () => {
      try {
        const res = await fetch(`${baseURL}/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({ model: modelName, messages, temperature: 0.5, max_tokens: 4096, stream: true }),
        });
        if (!res.ok) { send({ type: "error", content: `API ${res.status}` }); send({ type: "done" }); return; }

        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() || "";
          for (const line of lines) {
            const d = line.trim();
            if (!d.startsWith("data:")) continue;
            const json = d.slice(5).trim();
            if (json === "[DONE]") continue;
            try {
              const content = JSON.parse(json).choices?.[0]?.delta?.content;
              if (content) send({ type: "text", content });
            } catch {}
          }
        }
        send({ type: "done" });
      } catch (err: any) {
        send({ type: "error", content: String(err) });
        send({ type: "done" });
      }
    })());

    return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" } });
  });
