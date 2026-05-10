import { Hono } from "hono";
import { db, storage, secret, vars, ctx } from "edgespark";
import { auth } from "edgespark/http";
import { eq, asc } from "drizzle-orm";
import { projects, conversations, tools, executionSteps, buckets } from "@defs";

const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
};

function sse(ctrl: ReadableStreamDefaultController, data: Record<string, unknown>) {
  ctrl.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`));
}

// Tool definitions (matching DeepSeek-TUI's typed tool surface)
const TOOLS = [
  {
    type: "function",
    function: {
      name: "read_file",
      description: "读取项目中的文件内容",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "文件路径，如 src/index.html" },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description: "创建或覆盖文件",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "文件路径" },
          content: { type: "string", description: "文件内容" },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "edit_file",
      description: "在文件中搜索并替换指定内容（比完整重写更高效）",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "文件路径" },
          old_string: { type: "string", description: "要替换的原始文本" },
          new_string: { type: "string", description: "替换后的新文本" },
        },
        required: ["path", "old_string", "new_string"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_files",
      description: "列出项目中的所有文件",
      parameters: {
        type: "object",
        properties: {
          prefix: { type: "string", description: "可选的路径前缀过滤" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "grep_files",
      description: "在项目文件中搜索匹配的文本模式（正则）",
      parameters: {
        type: "object",
        properties: {
          pattern: { type: "string", description: "要搜索的正则表达式模式" },
          path: { type: "string", description: "可选的文件路径限制" },
        },
        required: ["pattern"],
      },
    },
  },
];

export const vibeRoutes = new Hono()
  .post("/:projectId/vibe", async (c) => {
    const userId = auth.user!.id;
    const projectId = parseInt(c.req.param("projectId"), 10);

    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId));
    if (!project) return c.json({ error: "Project not found" }, 404);

    const body = await c.req.json<{ message: string }>();
    if (!body.message?.trim()) return c.json({ error: "Message required" }, 400);

    const baseURL = vars.get("DEEPSEEK_BASE_URL") || "https://api.deepseek.com";
    const apiKey = secret.get("DEEPSEEK_API_KEY");
    if (!apiKey) return c.json({ error: "API key not configured" }, 500);

    // Save user message
    await db.insert(conversations).values({
      projectId,
      userId,
      role: "user",
      content: body.message.trim(),
    });

    // Load history
    const history = await db
      .select()
      .from(conversations)
      .where(eq(conversations.projectId, projectId))
      .orderBy(asc(conversations.createdAt))
      .limit(80);

    // Build messages array for API (OpenAI format)
    const apiMessages: Array<Record<string, unknown>> = [
      {
        role: "system",
        content:
          `你是 Smart 编程智能体，运行在 Web 平台上。你可以使用工具读写文件、搜索代码。

你生成的每个工具都是一个独立可部署的 Web 项目，遵循以下架构：

项目结构：
  index.html  — 入口页面，包含完整的 HTML + CSS + JS
  style.css   — 独立样式表（如需要）
  app.js      — 独立业务逻辑（如需要）

index.html 必须包含 SDK 引用（放在 </body> 前）：
  <script src="/api/public/smart/sdk.js"></script>

Smart SDK 提供以下全局 API：
  const data = await Smart.data.get('key');        // 读取数据
  await Smart.data.set('key', value);               // 写入数据
  await Smart.data.delete('key');                   // 删除数据
  const user = await Smart.auth.user();             // 当前用户，未登录返回 null

工作方式：
1. 先理解用户需求，用 list_files 了解项目结构
2. 用 write_file 生成 index.html（包含完整 HTML + Tailwind CSS CDN）
3. 如需额外样式或逻辑文件，生成 style.css / app.js
4. 用户要求数据持久化时，使用 Smart SDK

原则：
- 生成自包含、可交互的单文件 HTML 应用
- 使用 Tailwind CSS CDN (<script src="https://cdn.tailwindcss.com"></script>)
- 数据持久化必须通过 Smart SDK，不要用 localStorage
- 并行执行：独立操作一次完成
- 保持简洁：直接给出方案和结果
- 用中文回复`,
      },
    ];

    for (const msg of history) {
      if (msg.role === "user") {
        apiMessages.push({ role: "user", content: msg.content });
      } else if (msg.role === "assistant") {
        apiMessages.push({ role: "assistant", content: msg.content });
      }
    }

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

    const prefix = `${projectId}/${toolId}/`;
    let fullResponse = "";

    const stream = new ReadableStream({
      async start(controller) {
        try {
          let currentMessages = [...apiMessages];
          let stepCount = 0;
          const maxSteps = 15;

          // Agent loop: keep calling until no more tool calls
          while (stepCount < maxSteps) {
            stepCount++;
            const response = await fetch(`${baseURL}/v1/chat/completions`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
              },
              body: JSON.stringify({
                model: "deepseek-v4-pro",
                messages: currentMessages,
                tools: TOOLS,
                tool_choice: "auto",
                temperature: 0.5,
                max_tokens: 8192,
                stream: true,
              }),
            });

            if (!response.ok) {
              const errText = await response.text();
              console.error("DeepSeek API error:", response.status, errText.slice(0, 300));
              sse(controller, { type: "error", content: `API ${response.status}: ${errText.slice(0, 150)}` });
              break;
            }

            // Parse streaming response
            const reader = response.body!.getReader();
            const decoder = new TextDecoder();
            let buffer = "";
            let assistantContent = "";
            let reasoningContent = "";
            const toolCalls: Array<{
              id: string;
              function: { name: string; arguments: string };
            }> = [];
            const toolCallMap = new Map<number, { id: string; name: string; args: string }>();

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
                  if (!delta) continue;

                  // Text content
                  if (delta.content) {
                    assistantContent += delta.content;
                    fullResponse += delta.content;
                    sse(controller, { type: "text", content: delta.content });
                  }

                  // Thinking/reasoning — accumulate silently, don't flood UI
                  if (delta.reasoning_content) {
                    reasoningContent += delta.reasoning_content;
                  }

                  // Tool calls in stream
                  if (delta.tool_calls) {
                    for (const tc of delta.tool_calls) {
                      if (tc.index != null) {
                        if (tc.id) {
                          // Start of new tool call
                          toolCallMap.set(tc.index, {
                            id: tc.id,
                            name: tc.function?.name || "",
                            args: tc.function?.arguments || "",
                          });
                          sse(controller, { type: "tool_start", toolCallId: tc.id, name: tc.function?.name || "" });
                        } else if (tc.function?.arguments) {
                          // Continuation of arguments
                          const existing = toolCallMap.get(tc.index);
                          if (existing) existing.args += tc.function.arguments;
                        }
                      }
                    }
                  }
                } catch { /* skip partial chunks */ }
              }
            }

            // Collect tool calls from map
            for (const [, tc] of toolCallMap) {
              toolCalls.push({ id: tc.id, function: { name: tc.name, arguments: tc.args } });
            }

            // If no tool calls, agent is done
            if (toolCalls.length === 0) {
              break;
            }

            // Build assistant message — DeepSeek requires reasoning_content echo when tool calls present
            const assistantMsg: Record<string, unknown> = {
              role: "assistant",
            };
            if (assistantContent) {
              assistantMsg.content = assistantContent;
            }
            if (reasoningContent) {
              assistantMsg.reasoning_content = reasoningContent;
            }
            if (toolCalls.length > 0) {
              assistantMsg.content = assistantContent || "";
              assistantMsg.tool_calls = toolCalls.map((tc) => ({
                id: tc.id,
                type: "function",
                function: {
                  name: tc.function.name,
                  arguments: tc.function.arguments,
                },
              }));
            }
            currentMessages.push(assistantMsg);

            // Execute tool calls
            for (const tc of toolCalls) {
              const { name, arguments: argsStr } = tc.function;
              let args: Record<string, string> = {};
              try { args = JSON.parse(argsStr); } catch { /* invalid JSON */ }

              sse(controller, { type: "tool_start", toolCallId: tc.id, name });
              sse(controller, {
                type: "tool_exec",
                toolCallId: tc.id,
                name,
                input: argsStr,
              });

              let result: string;

              try {
                switch (name) {
                  case "read_file": {
                    const obj = await storage.from(buckets.sourceBuckets).get(prefix + args.path);
                    result = obj ? new TextDecoder().decode(obj.body) : "File not found";
                    break;
                  }
                  case "write_file": {
                    const encoder = new TextEncoder();
                    await storage.from(buckets.sourceBuckets).put(
                      prefix + args.path,
                      encoder.encode(args.content)
                    );
                    result = `File written: ${args.path}`;
                    sse(controller, {
                      type: "file",
                      path: args.path,
                      language: args.path.split(".").pop() || "text",
                      content: args.content,
                    });
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
                    const encoder = new TextEncoder();
                    await storage.from(buckets.sourceBuckets).put(prefix + args.path, encoder.encode(content));
                    result = `File edited: ${args.path}`;
                    sse(controller, {
                      type: "file",
                      path: args.path,
                      language: args.path.split(".").pop() || "text",
                      content,
                    });
                    break;
                  }
                  case "list_files": {
                    const listPrefix = prefix + (args.prefix || "");
                    const fileList = await storage.from(buckets.sourceBuckets).list({
                      prefix: listPrefix,
                      limit: 100,
                    });
                    result = fileList.files
                      .map((f) => f.path.replace(prefix, ""))
                      .join("\n") || "(empty)";
                    break;
                  }
                  case "grep_files": {
                    const listPrefix = prefix + (args.path ? args.path.replace(/\/[^/]*$/, "/") : "");
                    const fileList = await storage.from(buckets.sourceBuckets).list({
                      prefix: listPrefix || prefix,
                      limit: 50,
                    });
                    const matches: string[] = [];
                    const pattern = new RegExp(args.pattern, "gi");
                    for (const f of fileList.files) {
                      const obj = await storage.from(buckets.sourceBuckets).get(f.path);
                      if (!obj) continue;
                      const text = new TextDecoder().decode(obj.body);
                      const lines = text.split("\n");
                      for (let i = 0; i < lines.length; i++) {
                        if (pattern.test(lines[i])) {
                          matches.push(`${f.path.replace(prefix, "")}:${i + 1}: ${lines[i].trim()}`);
                        }
                      }
                    }
                    result = matches.slice(0, 30).join("\n") || "No matches found";
                    break;
                  }
                  default:
                    result = `Unknown tool: ${name}`;
                }
              } catch (err) {
                result = `Tool error: ${String(err)}`;
              }

              sse(controller, {
                type: "tool_result",
                toolCallId: tc.id,
                name,
                output: result.slice(0, 500),
              });

              // Add tool result to messages
              currentMessages.push({
                role: "tool",
                tool_call_id: tc.id,
                content: result,
              });

              // Save step to DB
              ctx.runInBackground(
                (async () => {
                  const existingSteps = await db
                    .select()
                    .from(executionSteps)
                    .where(eq(executionSteps.toolId, toolId));
                  await db.insert(executionSteps).values({
                    toolId,
                    stepOrder: existingSteps.length + 1,
                    type: name,
                    title: `${name}: ${argsStr.slice(0, 80)}`,
                    status: "completed",
                    detail: result.slice(0, 200),
                    terminalOutput: result.slice(0, 500),
                    startedAt: new Date().toISOString(),
                    completedAt: new Date().toISOString(),
                  });
                })()
              );
            }
          }

          // Save assistant message to DB
          await db.insert(conversations).values({
            projectId,
            userId,
            role: "assistant",
            content: fullResponse || "任务完成",
          });

          // Update tool status
          ctx.runInBackground(
            (async () => {
              await db
                .update(tools)
                .set({ status: "completed" })
                .where(eq(tools.id, toolId));
            })()
          );

          sse(controller, { type: "done" });
          controller.close();
        } catch (err) {
          try { sse(controller, { type: "error", content: String(err) }); } catch { /* */ }
          try { sse(controller, { type: "done" }); } catch { /* */ }
          try { controller.close(); } catch { /* */ }
        }
      },
    });

    return new Response(stream, { headers: SSE_HEADERS });
  });
