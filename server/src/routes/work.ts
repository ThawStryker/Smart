import { Hono } from "hono";
import { db, secret, vars, ctx } from "edgespark";
import { auth } from "edgespark/http";
import { eq, and, or, desc, like } from "drizzle-orm";
import { workAgents, workConversations, userProfiles, workFiles } from "@defs";
import { callAgentToolDef, loadAgentFiles, writeAgentFile, writeHeartbeat, type CallAgentArgs } from "../agent/tools/call-agent";

export const workRoutes = new Hono()
  .get("/api/work/files/*", async (c) => {
    const userId = auth.user!.id;
    const filePath = c.req.path.replace("/api/work/files/", "");
    const [row] = await db.select().from(workFiles)
      .where(and(eq(workFiles.userId, userId), eq(workFiles.path, filePath)));
    if (!row) return c.json({ error: "Not found" }, 404);
    return c.json({ path: row.path, content: row.content, isFolder: row.isFolder, updatedAt: row.updatedAt });
  })
  .get("/api/work/files", async (c) => {
    const userId = auth.user!.id;
    const prefix = c.req.query("prefix") || "";
    const rows = await db.select().from(workFiles)
      .where(and(eq(workFiles.userId, userId), like(workFiles.path, prefix + "%")))
      .orderBy(workFiles.path);
    return c.json(rows.map(r => ({ path: r.path, content: r.content, isFolder: r.isFolder, updatedAt: r.updatedAt })));
  })
  .put("/api/work/files/*", async (c) => {
    const userId = auth.user!.id;
    const filePath = c.req.path.replace("/api/work/files/", "");
    if (!filePath) return c.json({ error: "Path required" }, 400);
    const { content, isFolder } = await c.req.json<{ content?: string; isFolder?: boolean }>();
    if (content === undefined && isFolder === undefined) {
      return c.json({ error: "content or isFolder required" }, 400);
    }

    const [existing] = await db.select().from(workFiles)
      .where(and(eq(workFiles.userId, userId), eq(workFiles.path, filePath)));

    if (existing) {
      await db.update(workFiles).set({
        ...(content !== undefined ? { content } : {}),
        ...(isFolder !== undefined ? { isFolder } : {}),
        updatedAt: new Date().toISOString(),
      }).where(eq(workFiles.id, existing.id));
    } else {
      await db.insert(workFiles).values({
        userId, path: filePath,
        content: content || "",
        isFolder: isFolder || false,
      });
    }
    return c.json({ success: true });
  })
  .delete("/api/work/files/*", async (c) => {
    const userId = auth.user!.id;
    const filePath = c.req.path.replace("/api/work/files/", "");
    if (!filePath) return c.json({ error: "Path required" }, 400);

    // Delete file and any children (if folder)
    await db.delete(workFiles)
      .where(and(
        eq(workFiles.userId, userId),
        or(eq(workFiles.path, filePath), like(workFiles.path, filePath + "/%"))
      ));
    return c.json({ success: true });
  })
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
  .get("/api/work/conversations/:id", async (c) => {
    const userId = auth.user!.id;
    const id = parseInt(c.req.param("id"), 10);
    const [row] = await db.select().from(workConversations).where(and(eq(workConversations.id, id), eq(workConversations.userId, userId)));
    if (!row) return c.json({ error: "Not found" }, 404);
    return c.json(row);
  })
  .patch("/api/work/conversations/:id", async (c) => {
    const userId = auth.user!.id;
    const id = parseInt(c.req.param("id"), 10);
    const body = await c.req.json<{ title?: string; messagesJson?: string }>();
    await db.update(workConversations).set({ ...body, updatedAt: new Date().toISOString() }).where(and(eq(workConversations.id, id), eq(workConversations.userId, userId)));
    return c.json({ success: true });
  })
  .delete("/api/work/conversations/:id", async (c) => {
    const userId = auth.user!.id;
    const id = parseInt(c.req.param("id"), 10);
    await db.delete(workConversations).where(and(eq(workConversations.id, id), eq(workConversations.userId, userId)));
    return c.json({ success: true });
  })
  .post("/api/work/chat", async (c) => {
    const body = await c.req.json<{ message: string; model?: string; conversationId?: number }>();
    if (!body.message?.trim()) return c.json({ error: "Message required" }, 400);

    const userId = auth.user!.id;
    const baseURL = vars.get("SEED_BASE_URL") || "https://ark.cn-beijing.volces.com/api/v3";
    const apiKey = secret.get("SEED_API_KEY");
    const modelName = "doubao-seed-2-0-pro-260215";
    if (!apiKey) return c.json({ error: "API key not configured" }, 500);

    // Load work-agent config (root-level files)
    const workAgentFiles = await loadAgentFiles(userId, "");
    const systemPrompt = workAgentFiles.agentsMd || "你是 Smart Work 的主 Agent，帮助用户分析需求、布置任务。";
    const contextPrompt = workAgentFiles.contextFiles
      .map(f => `--- ${f.path} ---\n${f.content}`).join("\n\n");

    // List available agents
    const agentRows = await db.select().from(workFiles)
      .where(and(eq(workFiles.userId, userId), like(workFiles.path, "agents/%/AGENTS.md")));
    const availableAgents = agentRows.map(r => {
      const name = r.path.split("/")[1];
      const summary = r.content?.split("\n")[0]?.replace(/^#\s*/, "")?.slice(0, 80) || "";
      return `- **${name}**: ${summary}`;
    }).join("\n");

    const fullSystem = `${systemPrompt}

## 可用 Agent

你可以使用 call_agent 工具调用以下 agent：
${availableAgents}

## 上下文资料
${contextPrompt || "（无）"}

## 规则
- 当用户 @agent名称 时，使用 call_agent 工具调度该 agent
- 先制定计划再执行，多个 agent 可并行调用
- 完成后汇总结果告知用户`;

    const messages: any[] = [
      { role: "system", content: fullSystem },
      { role: "user", content: body.message },
    ];

    let ctrl: ReadableStreamDefaultController;
    const stream = new ReadableStream({ start(c) { ctrl = c; } });
    const encoder = new TextEncoder();
    const send = (d: Record<string, unknown>) => {
      try { ctrl.enqueue(encoder.encode(`data: ${JSON.stringify(d)}\n\n`)); } catch {}
    };

    ctx.runInBackground((async () => {
      try {
        let fullResponse = "";
        let iterationCount = 0;
        const maxIterations = 10;

        while (iterationCount < maxIterations) {
          iterationCount++;
          const res = await fetch(`${baseURL}/chat/completions`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
            body: JSON.stringify({
              model: modelName, messages,
              tools: iterationCount === 1 ? [callAgentToolDef] : undefined,
              temperature: 0.5, max_tokens: 4096, stream: true,
            }),
          });

          if (!res.ok) { send({ type: "error", content: `API ${res.status}` }); break; }

          const reader = res.body!.getReader();
          const decoder = new TextDecoder();
          let buf = "";
          let assistantMsg = "";
          let currentToolCalls: any[] = [];

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
                const parsed = JSON.parse(json);
                const delta = parsed.choices?.[0]?.delta;
                if (delta?.content) {
                  assistantMsg += delta.content;
                  fullResponse += delta.content;
                  send({ type: "text", content: delta.content });
                }
                if (delta?.tool_calls) {
                  for (const tc of delta.tool_calls) {
                    const idx = tc.index || 0;
                    if (!currentToolCalls[idx]) currentToolCalls[idx] = { id: tc.id || "", name: "", args: "" };
                    if (tc.id) currentToolCalls[idx].id = tc.id;
                    if (tc.function?.name) currentToolCalls[idx].name = tc.function.name;
                    if (tc.function?.arguments) currentToolCalls[idx].args += tc.function.arguments;
                  }
                }
              } catch {}
            }
          }

          const validCalls = currentToolCalls.filter(tc => tc.name === "call_agent");
          if (validCalls.length === 0) break;

          messages.push({ role: "assistant", content: assistantMsg || null, tool_calls: validCalls.map(tc => ({
            id: tc.id, type: "function", function: { name: tc.name, arguments: tc.args },
          })) });

          for (const tc of validCalls) {
            let args: CallAgentArgs;
            try { args = JSON.parse(tc.args); } catch { continue; }

            send({ type: "agent_start", name: args.name, task: args.task });

            const subFiles = await loadAgentFiles(userId, args.name);
            const subSystem = subFiles.agentsMd || `你是 ${args.name} agent。`;
            const subContext = subFiles.contextFiles.map(f => f.content).join("\n\n");
            const subSkills = subFiles.skillFiles.map(f => f.content).join("\n");

            const subMessages: any[] = [
              { role: "system", content: `${subSystem}\n\n## 上下文\n${subContext}\n\n## 技能\n${subSkills}\n\n## 任务\n${args.task}\n\n${args.context || ""}` },
              { role: "user", content: args.task },
            ];

            const subRes = await fetch(`${baseURL}/chat/completions`, {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
              body: JSON.stringify({ model: modelName, messages: subMessages, temperature: 0.5, max_tokens: 2048, stream: true }),
            });

            let subOutput = "";
            if (subRes.ok) {
              const subReader = subRes.body!.getReader();
              const subDecoder = new TextDecoder();
              let subBuf = "";
              while (true) {
                const { done, value } = await subReader.read();
                if (done) break;
                subBuf += subDecoder.decode(value, { stream: true });
                const subLines = subBuf.split("\n");
                subBuf = subLines.pop() || "";
                for (const line of subLines) {
                  const sd = line.trim();
                  if (!sd.startsWith("data:")) continue;
                  const sj = sd.slice(5).trim();
                  if (sj === "[DONE]") continue;
                  try {
                    const c = JSON.parse(sj).choices?.[0]?.delta?.content;
                    if (c) { subOutput += c; send({ type: "agent_progress", name: args.name, text: c }); }
                  } catch {}
                }
              }
            }

            const outputPath = `Context/${args.task.slice(0, 20).replace(/[\/\s]/g, "_")}.md`;
            await writeAgentFile(userId, args.name, outputPath, subOutput);
            await writeHeartbeat(userId, args.name, `完成: ${args.task}`);

            send({ type: "agent_done", name: args.name, files: [outputPath] });
            messages.push({ role: "tool", tool_call_id: tc.id, content: subOutput || "任务完成" });
          }
        }

        send({ type: "done" });
      } catch (err: any) {
        send({ type: "error", content: String(err) });
        send({ type: "done" });
      }
    })());

    return new Response(stream, {
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
    });
  });
