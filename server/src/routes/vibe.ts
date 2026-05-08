import { Hono } from "hono";
import { db, storage, secret, vars, ctx } from "edgespark";
import { auth } from "edgespark/http";
import { eq, and, asc } from "drizzle-orm";
import { projects, conversations, tools, executionSteps, buckets } from "@defs";

const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
};

function sendSSE(stream: ReadableStreamDefaultController, data: unknown) {
  const line = `data: ${JSON.stringify(data)}\n\n`;
  stream.enqueue(new TextEncoder().encode(line));
}

export const vibeRoutes = new Hono()
  .post("/:projectId/vibe", async (c) => {
    const userId = auth.user!.id;
    const projectId = parseInt(c.req.param("projectId"), 10);

    const [project] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.userId, userId)));
    if (!project) return c.json({ error: "Project not found" }, 404);

    const body = await c.req.json<{ message: string }>();
    if (!body.message?.trim()) return c.json({ error: "Message required" }, 400);

    const baseURL = vars.get("DEEPSEEK_BASE_URL") || "https://api.deepseek.com";
    const apiKey = secret.get("DEEPSEEK_API_KEY");
    if (!apiKey) return c.json({ error: "DeepSeek API key not configured" }, 500);

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
      .limit(40);

    const messages = [
      {
        role: "system",
        content:
          `你是一个 Vibe Coding AI 编程助手，像 Claude Code 一样工作。请用中文回复。

工作方式：
1. 先分析用户需求，说出你的思路
2. 当需要写代码时，用代码块输出，格式：\`\`\`语言:文件路径\\n代码内容\\n\`\`\`
3. 每完成一个文件，简要说明这个文件的作用
4. 像一个真正的编程伙伴一样，保持对话自然流畅

示例回复：
好的，我来帮你创建一个计算器应用。首先写 HTML 结构：

\`\`\`html:src/index.html
<!DOCTYPE html>
<html>
<head><title>计算器</title></head>
<body>
  <div id="calculator">...</div>
</body>
</html>
\`\`\`

HTML 骨架搭好了，接下来写样式和逻辑...`,
      },
      ...history.map((msg) => ({
        role: msg.role as "user" | "assistant",
        content: msg.content,
      })),
    ];

    let fullResponse = "";
    let toolId = 0;

    // Find or create tool
    const [existingTool] = await db
      .select()
      .from(tools)
      .where(eq(tools.projectId, projectId))
      .limit(1);

    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Create tool
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

          // Create step
          const [step] = await db
            .insert(executionSteps)
            .values({
              toolId,
              stepOrder: 1,
              type: "vibe_coding",
              title: `处理: ${body.message.trim().slice(0, 40)}`,
              status: "running",
              startedAt: new Date().toISOString(),
            })
            .returning();

          sendSSE(controller, {
            type: "step",
            status: "running",
            title: `开始处理: ${body.message.trim().slice(0, 40)}`,
          });

          // Call DeepSeek with streaming
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
              max_tokens: 8192,
              stream: true,
            }),
          });

          if (!response.ok) {
            const errText = await response.text();
            sendSSE(controller, { type: "error", content: `API error: ${response.status}` });
            sendSSE(controller, { type: "done" });
            controller.close();

            await db
              .update(executionSteps)
              .set({ status: "failed", terminalOutput: errText, completedAt: new Date().toISOString() })
              .where(eq(executionSteps.id, step!.id));
            return;
          }

          const reader = response.body!.getReader();
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
                const delta = parsed.choices?.[0]?.delta?.content;
                if (delta) {
                  fullResponse += delta;
                  sendSSE(controller, { type: "text", content: delta });
                }
              } catch {
                // ignore parse errors for partial chunks
              }
            }
          }

          // Process complete response for code blocks
          const codeBlockRegex = /```(\w+)?:?(\S+)?\n([\s\S]*?)```/g;
          const prefix = `${projectId}/${toolId}/`;
          let match;
          const files: Array<{ path: string; language: string }> = [];

          while ((match = codeBlockRegex.exec(fullResponse)) !== null) {
            const language = match[1] || "";
            const filePath = match[2] || `code.${language || "txt"}`;
            const code = match[3];

            // Save to R2
            const encoder = new TextEncoder();
            await storage.from(buckets.sourceBuckets).put(prefix + filePath, encoder.encode(code));
            files.push({ path: filePath, language });

            // Notify frontend about file
            sendSSE(controller, {
              type: "file",
              path: filePath,
              language,
              content: code,
            });

            sendSSE(controller, {
              type: "step",
              status: "completed",
              title: `已生成: ${filePath}`,
              detail: `${code.split("\n").length} 行 ${language}`,
            });
          }

          // Update step — store file list in metadata for reliable retrieval
          const terminalOutput = `生成文件:\n${files.map((f) => `  - ${f.path}`).join("\n")}`;
          const fileMetadata = JSON.stringify(files);
          await db
            .update(executionSteps)
            .set({
              status: "completed",
              terminalOutput,
              detail: `生成 ${files.length} 个文件`,
              metadata: fileMetadata,
              completedAt: new Date().toISOString(),
            })
            .where(eq(executionSteps.id, step!.id));

          // Save assistant message
          await db.insert(conversations).values({
            projectId,
            userId,
            role: "assistant",
            content: fullResponse,
          });

          // Complete tool
          ctx.runInBackground(
            (async () => {
              await db
                .update(tools)
                .set({ status: "completed" })
                .where(eq(tools.id, toolId));
            })()
          );

          sendSSE(controller, {
            type: "step",
            status: "completed",
            title: `完成！共生成 ${files.length} 个文件`,
            files,
          });

          sendSSE(controller, { type: "done" });
          controller.close();
        } catch (err) {
          console.error("Vibe error:", err);
          try { sendSSE(controller, { type: "error", content: String(err) }); } catch {}
          try { sendSSE(controller, { type: "done" }); } catch {}
          try { controller.close(); } catch {}
        }
      },
    });

    return new Response(stream, { headers: SSE_HEADERS });
  });
