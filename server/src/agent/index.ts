import { Hono } from "hono";
import { db, storage, secret, vars, ctx } from "edgespark";
import { auth } from "edgespark/http";
import { eq, asc, inArray } from "drizzle-orm";
import { projects, conversations, tools, executionSteps, buckets, userProfiles, mcps, skills as skillsDef, marketListings } from "@defs";

import { classifyTask, getWorkflowState, advancePhase, getPhaseConfig, type Phase } from "./workflow";
import { buildSystemPrompt } from "./prompts";
import { buildToolList, buildSkillContext } from "./tools";
import { buildMemoryContext, extractMemoriesFromMessage } from "./memory";

const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
};

function emit(queue: Array<Record<string, unknown>>, data: Record<string, unknown>) {
  queue.push(data);
}

export const agentRoutes = new Hono()
  .post("/:projectId/vibe", async (c) => {
    const userId = auth.user!.id;
    const projectId = parseInt(c.req.param("projectId"), 10);

    const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
    if (!project) return c.json({ error: "Project not found" }, 404);

    const body = await c.req.json<{ message: string; model?: string; images?: string[]; mcps?: string[]; skills?: string[] }>();
    if (!body.message?.trim() && (!body.images || body.images.length === 0)) {
      return c.json({ error: "Message required" }, 400);
    }

    // === Auth & Model Selection ===
    const isAdminUser = await db.select().from(userProfiles).where(eq(userProfiles.userId, userId)).then(r => r[0]?.role === "admin");
    let selectedModel = body.model || "seed";
    if (selectedModel === "deepseek" && !isAdminUser) selectedModel = "seed";

    let baseURL: string, apiKey: string | null, modelName: string;
    if (selectedModel === "seed") {
      baseURL = vars.get("SEED_BASE_URL") || "https://ark.cn-beijing.volces.com/api/v3";
      apiKey = secret.get("SEED_API_KEY");
      modelName = "doubao-seed-2-0-code-preview-260215";
    } else {
      baseURL = vars.get("DEEPSEEK_BASE_URL") || "https://api.deepseek.com";
      apiKey = secret.get("DEEPSEEK_API_KEY");
      modelName = "deepseek-v4-pro";
    }
    if (!apiKey) return c.json({ error: `API key not configured for ${selectedModel}` }, 500);

    const apiPath = selectedModel === "seed" ? "/chat/completions" : "/v1/chat/completions";

    // === Save user message ===
    await db.insert(conversations).values({
      projectId, userId, role: "user",
      content: body.message?.trim() || (body.images?.length ? "[图片]" : ""),
    });

    // === Workflow: determine phase ===
    const userMessage = body.message || "";
    const { level: taskLevel } = classifyTask(userMessage);
    let currentState = await getWorkflowState(projectId);
    const nextPhase = await advancePhase(projectId, currentState.phase, userMessage, taskLevel);
    const phaseConfig = getPhaseConfig(nextPhase);

    // === Build prompt with memory + skills ===
    const memoryCtx = await buildMemoryContext(userId, projectId);
    const skillCtx = await buildSkillContext(body.skills || []);
    const mcpCtx = ""; // MCP context built separately via tools

    const systemPrompt = buildSystemPrompt(nextPhase, memoryCtx, skillCtx, mcpCtx);

    // === Build messages ===
    const apiMessages: Array<Record<string, unknown>> = [
      { role: "system", content: systemPrompt },
    ];

    // Inject MCP tool descriptions into system prompt
    const selectedMcps = (body.mcps || []).filter(Boolean);
    if (selectedMcps.length > 0) {
      const mcpRows = await db.select().from(mcps).where(inArray(mcps.name, selectedMcps));
      if (mcpRows.length > 0) {
        const desc = mcpRows.map(m => `- ${m.name}: ${m.description || ""}`).join("\n");
        apiMessages[0] = { role: "system", content: (apiMessages[0].content as string) + `\n\n## 可用 MCP\n\n${desc}` };
      }
    }

    // Load history
    const history = await db.select().from(conversations)
      .where(eq(conversations.projectId, projectId))
      .orderBy(asc(conversations.createdAt)).limit(80);

    for (const msg of history) {
      if (msg.role === "user") apiMessages.push({ role: "user", content: msg.content });
      else if (msg.role === "assistant") apiMessages.push({ role: "assistant", content: msg.content });
    }

    // Handle images
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
    const { tools: activeTools, mcpMap } = await buildToolList(nextPhase, selectedMcps);

    // === Find or create tool record ===
    const [existingTool] = await db.select().from(tools).where(eq(tools.projectId, projectId)).limit(1);
    let toolId = existingTool?.id;
    if (!toolId) {
      const [nt] = await db.insert(tools).values({
        projectId, name: `${project.name}-v1`, version: "0.1.0", status: "building",
      }).returning();
      toolId = nt!.id;
    }

    const prefix = `${projectId}/${toolId}/`;
    let fullResponse = "";
    let savedConvId: number | null = null;
    let textChunks = 0;
    const generatedFiles: Array<{ path: string; language: string }> = [];
    const eventQueue: Array<Record<string, unknown>> = [];

    // === SSE Stream ===
    const stream = new ReadableStream({
      async start(controller) {
        while (true) {
          while (eventQueue.length > 0) {
            const data = eventQueue.shift()!;
            try {
              controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`));
              if (data.type === "done") { controller.close(); return; }
            } catch { return; }
          }
          await new Promise(r => setTimeout(r, 50));
        }
      },
    });

    // === Agent Loop ===
    const agentPromise = (async () => {
      try {
        let maxRounds = 20;
        while (maxRounds-- > 0) {
          // Call AI
          const reqBody: Record<string, unknown> = {
            model: modelName,
            messages: apiMessages,
            tools: activeTools,
            stream: true,
          };
          if (selectedModel === "deepseek") {
            reqBody.reasoning_effort = "high";
          }

          const res = await fetch(`${baseURL}${apiPath}`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify(reqBody),
          });

          if (!res.ok) {
            const errText = await res.text();
            emit(eventQueue, { type: "error", content: `API error: ${res.status} ${errText.slice(0, 200)}` });
            break;
          }

          // Parse SSE stream
          const reader = res.body!.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          let toolCalls: Array<{ id: string; function: { name: string; arguments: string } }> = [];
          let thinkingText = "";
          let inThinking = false;
          let responseText = "";

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              if (!line.startsWith("data: ")) continue;
              const data = line.slice(6);
              if (data === "[DONE]") continue;

              try {
                const json = JSON.parse(data);
                const delta = json.choices?.[0]?.delta;

                if (delta?.reasoning_content) {
                  inThinking = true;
                  thinkingText += delta.reasoning_content;
                  emit(eventQueue, { type: "thinking", content: delta.reasoning_content });
                  continue;
                }

                if (inThinking && (delta?.content || delta?.tool_calls)) {
                  inThinking = false;
                  emit(eventQueue, { type: "thinking_complete" });
                }

                if (delta?.content) {
                  textChunks++;
                  responseText += delta.content;
                  fullResponse += delta.content;
                  if (textChunks <= 3) {
                    emit(eventQueue, { type: "text", content: delta.content });
                  }
                }

                if (delta?.tool_calls) {
                  for (const tc of delta.tool_calls) {
                    const idx = tc.index ?? toolCalls.length;
                    if (!toolCalls[idx]) {
                      toolCalls[idx] = { id: tc.id || "", function: { name: "", arguments: "" } };
                      emit(eventQueue, { type: "tool_start", name: tc.function?.name || "", toolCallId: tc.id });
                    }
                    if (tc.id) toolCalls[idx].id = tc.id;
                    if (tc.function?.name) toolCalls[idx].function.name += tc.function.name;
                    if (tc.function?.arguments) toolCalls[idx].function.arguments += tc.function.arguments;
                  }
                }

                if (json.choices?.[0]?.finish_reason === "tool_calls" || json.choices?.[0]?.finish_reason === "stop") {
                  // Will be handled after the loop
                }
              } catch {}
            }
          }

          // Save assistant response
          if (responseText || toolCalls.length > 0) {
            const [saved] = await db.insert(conversations).values({
              projectId, userId, role: "assistant",
              content: fullResponse || "[工具调用]",
            }).returning();
            if (saved) savedConvId = saved.id;
          }

          // Execute tool calls
          if (toolCalls.length > 0) {
            apiMessages.push({ role: "assistant", content: fullResponse || null, tool_calls: toolCalls.map(tc => ({
              id: tc.id, type: "function",
              function: { name: tc.function.name, arguments: tc.function.arguments },
            })) });

            let stepIdx = 0;
            for (const tc of toolCalls) {
              stepIdx++;
              const toolName = tc.function.name;
              await db.insert(executionSteps).values({
                toolId,
                stepOrder: stepIdx,
                type: toolName,
                title: `${toolName}: ${tc.function.arguments.slice(0, 80)}`,
                status: "running",
                startedAt: new Date().toISOString(),
              });

              let result: string;
              try {
                const args = JSON.parse(tc.function.arguments || "{}");

                emit(eventQueue, { type: "tool_exec", toolCallId: tc.id, name: toolName, input: JSON.stringify(args) });

                // === Tool Execution ===
                switch (toolName) {
                  case "read_file": {
                    const obj = await storage.from(buckets.sourceBuckets).get(prefix + args.path);
                    result = obj ? new TextDecoder().decode(obj.body) : "File not found";
                    break;
                  }
                  case "write_file": {
                    const enc = new TextEncoder();
                    await storage.from(buckets.sourceBuckets).put(prefix + args.path, enc.encode(args.content));
                    const lang = args.path.split(".").pop() || "text";
                    generatedFiles.push({ path: args.path, language: lang });
                    result = `File written: ${args.path}`;
                    emit(eventQueue, { type: "file", path: args.path, language: lang, content: args.content, toolId });
                    break;
                  }
                  case "edit_file": {
                    const obj = await storage.from(buckets.sourceBuckets).get(prefix + args.path);
                    if (!obj) { result = "File not found"; break; }
                    let content = new TextDecoder().decode(obj.body);
                    if (!content.includes(args.old_string)) {
                      result = `Error: old_string not found in ${args.path}`;
                      break;
                    }
                    content = content.replace(args.old_string, args.new_string);
                    await storage.from(buckets.sourceBuckets).put(prefix + args.path, new TextEncoder().encode(content));
                    if (!generatedFiles.some(f => f.path === args.path)) {
                      generatedFiles.push({ path: args.path, language: args.path.split(".").pop() || "text" });
                    }
                    result = `File edited: ${args.path}`;
                    emit(eventQueue, { type: "file", path: args.path, language: args.path.split(".").pop() || "text", content, toolId });
                    break;
                  }
                  case "list_files": {
                    const listPrefix = prefix + (args.prefix || "");
                    const fileList = await storage.from(buckets.sourceBuckets).list({ prefix: listPrefix, limit: 100 });
                    result = fileList.files.map(f => f.path.replace(prefix, "")).join("\n") || "(empty)";
                    break;
                  }
                  case "grep_files": {
                    const listPrefix = prefix + (args.path ? args.path.replace(/\/[^/]*$/, "/") : "");
                    const fileList = await storage.from(buckets.sourceBuckets).list({ prefix: listPrefix || prefix, limit: 50 });
                    const matches: string[] = [];
                    const pattern = new RegExp(args.pattern, "gi");
                    for (const f of fileList.files) {
                      const obj = await storage.from(buckets.sourceBuckets).get(f.path);
                      if (!obj) continue;
                      const lines = new TextDecoder().decode(obj.body).split("\n");
                      for (let i = 0; i < lines.length; i++) {
                        if (pattern.test(lines[i])) {
                          matches.push(`${f.path.replace(prefix, "")}:${i + 1}: ${lines[i].trim()}`);
                        }
                      }
                    }
                    result = matches.slice(0, 30).join("\n") || "No matches found";
                    break;
                  }
                  case "web_search": {
                    try {
                      const q = encodeURIComponent(args.query as string);
                      const sr = await fetch(`https://api.duckduckgo.com/?q=${q}&format=json&no_html=1`, {
                        headers: { "User-Agent": "Smart/1.0" },
                      });
                      if (sr.ok) {
                        const json = await sr.json() as any;
                        const items = json.Results || json.RelatedTopics || [];
                        result = items.slice(0, 5).map((r: any) => `${r.Text || ""} — ${r.FirstURL || ""}`).join("\n") || "No results";
                      } else {
                        result = `Search failed: ${sr.status}`;
                      }
                    } catch { result = "Web search unavailable"; }
                    break;
                  }
                  case "smart_market": {
                    try {
                      const ml = await db.select().from(marketListings).where(eq(marketListings.status, "approved")).limit(10);
                      result = ml.map(i => `- ${i.title}: ${i.description || ""}`).join("\n") || "No tools";
                    } catch { result = "Market unavailable"; }
                    break;
                  }
                  default: {
                    // Try MCP handler
                    const mcpCfg = mcpMap.get(toolName);
                    if (mcpCfg) {
                      result = `MCP tool ${toolName} called with args: ${JSON.stringify(args)}`;
                    } else {
                      result = `Unknown tool: ${toolName}`;
                    }
                  }
                }

                emit(eventQueue, { type: "tool_result", toolCallId: tc.id, name: toolName, output: result.slice(0, 500) });
              } catch (err) {
                result = `Tool error: ${String(err)}`;
                emit(eventQueue, { type: "tool_result", toolCallId: tc.id, name: toolName, output: result.slice(0, 500) });
              }

              await db.update(executionSteps)
                .set({ status: "completed", detail: result.slice(0, 200), terminalOutput: result.slice(0, 500), completedAt: new Date().toISOString() })
                .where(eq(executionSteps.toolId, toolId));

              apiMessages.push({
                role: "tool",
                tool_call_id: tc.id,
                content: result,
              });
            }

            // Continue loop for next AI response
            fullResponse = "";
            textChunks = 0;
            continue;
          }

          // No more tool calls — agent is done
          break;
        }

        // Save final state
        if (savedConvId && fullResponse) {
          await db.update(conversations).set({ content: fullResponse }).where(eq(conversations.id, savedConvId));
        }

        // Update tool status
        ctx.runInBackground((async () => {
          await db.update(tools).set({
            status: "completed",
            metadata: generatedFiles.length > 0 ? JSON.stringify(generatedFiles) : null,
          }).where(eq(tools.id, toolId));
        })());

        // Extract memories
        ctx.runInBackground((async () => {
          try {
            await extractMemoriesFromMessage(userId, projectId, userMessage, fullResponse);
          } catch {}
        })());

        // Phase hint for heavy tasks
        if (taskLevel === "heavy" && phaseConfig.userPromptHint) {
          emit(eventQueue, { type: "text", content: `\n\n${phaseConfig.userPromptHint}` });
        }

        emit(eventQueue, { type: "done", toolId });
      } catch (err) {
        emit(eventQueue, { type: "error", content: String(err) });
        emit(eventQueue, { type: "done" });
      }
    })();

    ctx.runInBackground(agentPromise);
    return new Response(stream, { headers: SSE_HEADERS });
  });
