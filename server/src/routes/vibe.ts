import { Hono } from "hono";
import { db, storage, secret, vars, ctx } from "edgespark";
import { auth } from "edgespark/http";
import { eq, asc, inArray } from "drizzle-orm";
import { projects, conversations, tools, executionSteps, buckets, userProfiles, mcps, skills as skillsDef, marketListings } from "@defs";

const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
};

function emit(queue: Array<Record<string, unknown>>, data: Record<string, unknown>) {
  queue.push(data);
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
  {
    type: "function",
    function: {
      name: "web_search",
      description: "在网络上搜索实时信息",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "搜索关键词" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "smart_market",
      description: "浏览 Smart 工具市场中的已发布工具",
      parameters: {
        type: "object",
        properties: {},
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

    const body = await c.req.json<{ message: string; model?: string; images?: string[]; mcps?: string[]; skills?: string[] }>();
    if (!body.message?.trim() && (!body.images || body.images.length === 0)) return c.json({ error: "Message required" }, 400);

    // Enforce admin-only model
    const isAdminUser = await db.select().from(userProfiles).where(eq(userProfiles.userId, userId)).then(r => r[0]?.role === "admin");
    let selectedModel = body.model || "seed";
    if (selectedModel === "deepseek" && !isAdminUser) selectedModel = "seed";

    let baseURL: string;
    let apiKey: string | null;
    let modelName: string;

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

    // Save user message
    const userMessageContent = body.message?.trim() || (body.images?.length ? "[图片]" : "");
    await db.insert(conversations).values({
      projectId,
      userId,
      role: "user",
      content: userMessageContent,
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
          `你是 Smart，一个 Web 平台上的 AI 编程智能体。你通过工具读写文件、搜索代码、执行命令，为用户生成完整的 Web 应用。

## 语言

每轮对话的语言以用户最新消息为准。如果用户说中文，thinking 和回复都用中文。

## 开场节奏

用简短有力的行动声明开场——说出你在做什么，不要复述用户的需求。
好的："我先看看项目结构。"
避免："我很兴奋能帮你做这个！"

## 分解哲学

在行动之前先分解。对于任何非平凡的请求：
1. **预览**——先用 list_files 扫描项目结构，识别问题边界
2. **分块**——将复杂任务拆成独立子任务，batch 并行工具调用
3. **递归**——当子任务揭示子问题时，继续分解

默认工作流：
1. 理解用户需求，了解项目结构
2. 用 write_file 生成代码（单文件 HTML 或多文件项目）
3. 用户要求数据持久化时，使用 Smart SDK
4. 批量执行独立的工具调用，不要逐个等待

## 验证原则

每次工具调用后，在行动之前验证结果：
- 文件读取：确认内容匹配预期
- 文件写入：确认文件已正确创建
- 搜索结果：确认匹配是预期的

## 并行优先

独立操作同时执行。读取 3 个文件 → 一次调 3 个 read_file。搜索 2 个模式 → 一次调 2 个 grep_files。

## 生成工具项目架构

你生成的每个工具都是一个独立可部署的 Web 项目：

项目结构：
  index.html  — 入口页面，完整的 HTML + CSS + JS
  style.css   — 独立样式表（如需要）
  app.js      — 独立业务逻辑（如需要）

index.html 必须包含 SDK 引用（放在 </body> 前）：
  <script src="/api/public/smart/sdk.js"></script>

Smart SDK 全局 API：
  const data = await Smart.data.get('key');        // 读取数据
  await Smart.data.set('key', value);               // 写入数据
  await Smart.data.delete('key');                   // 删除数据
  const user = await Smart.auth.user();             // 当前工具用户，未登录返回 null
  await Smart.auth.signUp(email, password, name);   // 注册（自动设置 cookie）
  await Smart.auth.signIn(email, password);         // 登录（设置 cookie）
  await Smart.auth.signOut();                       // 退出

认证策略由生成的工具自己决定：
  - 需要登录的工具：页面初始化时调 Smart.auth.user()，若 null 则跳转到自定义登录页
  - 公开工具：不调 Smart.auth.user()，即开即用
  - 若用户需求中有"登录""注册""账号""用户系统"，需生成登录/注册页面，调用 Smart.auth.signUp/signIn
  - 每个工具的用户系统完全独立，与其他工具和 Smart 平台不共享
  - 密码最少 6 位
  - 页面间的跳转必须使用相对路径（如 window.location.href = 'login.html'），不能用绝对路径（如 '/login.html'），否则在预览和部署环境中会跳转失败

## 工具使用指南

- write_file：创建新文件或完整重写
- edit_file：文件中单个明确的替换
- read_file：读取文件内容
- list_files：列出项目文件
- grep_files：搜索代码模式
- 使用 Tailwind CSS CDN (<script src="https://cdn.tailwindcss.com"></script>)
- 数据持久化必须通过 Smart SDK，不要用 localStorage
	- 生成自包含、可交互的单文件 HTML 应用
	- body 设置 min-height: 100vh; overflow-y: auto，确保页面在 iframe 中可滚动，所有内容可见

## 思维预算

根据任务复杂度匹配思考深度：
- 简单查找/搜索：跳过思考
- 代码生成（单文件）：轻度思考
- 多文件项目：中度思考
- 调试/架构设计：深度思考

## 上下文管理

你有大上下文窗口。当历史对话变深时，倾向于追加新证据而非总结删除旧内容。引用已有结论而非重新推导。

## Superpowers 研发流程

你是 Smart Agent，内置 Superpowers 研发方法论。根据用户任务复杂度，自动采用分级流程：

### 复杂度判断

| 等级 | 判断标准 | 流程 |
|------|---------|------|
| **轻量** | 样式微调、文案修改、单行 fix、简单问答 | 直接实施 → 验证结果 |
| **中等** | Bug 修复、小功能追加、单文件改动 | 简要分析 → 实施 → 验证 → 完成 |
| **重量** | 新功能、架构改动、跨文件重构、多步骤任务 | 需求分析 → 设计方案 → 编写计划 → 分步实施 → 验证 → 审查 → 完成 |

### 执行规则

- 接到任务后，**先声明任务等级和将采用的流程**，再开始工作
- 重量级任务：先理解现状，提出 2-3 种方案和权衡，让用户确认后再实施
- 中等任务：简要说明问题原因和修复思路，然后实施
- 轻量任务：直接动手，完成后验证
- 所有任务完成后必须验证结果——文件存在、内容正确、编译通过
- 对于重量级任务，在实施完成后提示用户可以生成项目说明文档

## 输出格式

- 用简洁的段落解释
- 用列表展示步骤和选项
- 用代码块展示代码和命令
- 表格谨慎使用，在 Web 上可以正常渲染`,
      },
    ];

    // Inject selected MCPs
    const selectedMcps = (body.mcps || []).filter(Boolean);
    const selectedSkills = (body.skills || []).filter(Boolean);

    if (selectedMcps.length > 0) {
      const mcpRows = await db.select().from(mcps).where(inArray(mcps.name, selectedMcps));
      if (mcpRows.length > 0) {
        const mcpDesc = mcpRows.map(m => `- **${m.name}**: ${m.description || ""} (config: ${m.config || "{}"})`).join("\n");
        apiMessages[0] = { role: "system", content: (apiMessages[0].content as string) + `\n\n## 可用 MCP 工具\n\n${mcpDesc}\n\n调用 MCP 时使用工具调用机制。` };
      }
    }

    if (selectedSkills.length > 0) {
      const skillRows = await db.select().from(skillsDef).where(inArray(skillsDef.name, selectedSkills));
      for (const skill of skillRows) {
        if (skill.status === "installed" && skill.storagePath) {
          // Try to read SKILL.md from R2
          const skillMd = await storage.from(buckets.sourceBuckets).get(skill.storagePath + "SKILL.md");
          if (!skillMd) {
            // Try nested paths
            const list = await storage.from(buckets.sourceBuckets).list({ prefix: skill.storagePath, limit: 50 });
            const mdPath = list.files.find(f => f.path.endsWith("/SKILL.md") || f.path.endsWith("SKILL.md"));
            if (mdPath) {
              const obj = await storage.from(buckets.sourceBuckets).get(mdPath.path);
              if (obj) {
                apiMessages[0] = { role: "system", content: (apiMessages[0].content as string) + `\n\n## Skill: ${skill.name}\n\n${new TextDecoder().decode(obj.body).slice(0, 3000)}` };
              }
            }
          } else {
            apiMessages[0] = { role: "system", content: (apiMessages[0].content as string) + `\n\n## Skill: ${skill.name}\n\n${new TextDecoder().decode(skillMd.body).slice(0, 3000)}` };
          }
        }
      }
    }

    // Always inject superpowers SKILL.md as built-in capability
    const [superpowersSkill] = await db.select().from(skillsDef).where(eq(skillsDef.name, "superpowers"));
    if (superpowersSkill && superpowersSkill.status === "installed" && superpowersSkill.storagePath) {
      const spMd = await storage.from(buckets.sourceBuckets).get(superpowersSkill.storagePath + "SKILL.md");
      if (spMd) {
        apiMessages[0] = { role: "system", content: (apiMessages[0].content as string) + "\n\n## 内置 Skill: superpowers\n\n" + new TextDecoder().decode(spMd.body).slice(0, 3000) };
      }
    }

    // Build tools list — dynamically add MCP tools
    const activeTools: Array<Record<string, unknown>> = [...TOOLS];
    const mcpToolMap = new Map<string, Record<string, unknown>>();

    // Always inject smart-deploy as a built-in tool
    const [smartDeployMcp] = await db.select().from(mcps).where(eq(mcps.name, "smart-deploy"));
    if (smartDeployMcp && smartDeployMcp.enabled && smartDeployMcp.config) {
      try {
        const cfg = JSON.parse(smartDeployMcp.config);
        activeTools.push({
          type: "function",
          function: {
            name: "smart_deploy",
            description: cfg.description || smartDeployMcp.description || "Deploy the current project",
            parameters: cfg.parameters || { type: "object", properties: {} },
          },
        });
      } catch {}
    }
    if (selectedMcps.length > 0) {
      const mcpRows = await db.select().from(mcps).where(inArray(mcps.name, selectedMcps));
      for (const m of mcpRows) {
        if (m.enabled && m.config) {
          try {
            const cfg = JSON.parse(m.config);
            const name = m.name.replace(/-/g, "_");
            const tool = {
              type: "function",
              function: {
                name,
                description: cfg.description || m.description || m.name,
                parameters: cfg.parameters || { type: "object", properties: {}, required: [] },
              },
            };
            activeTools.push(tool);
            mcpToolMap.set(name, cfg);
          } catch { /* skip malformed config */ }
        }
      }
    }

    const images = body.images || [];
    for (const msg of history) {
      if (msg.role === "user") {
        apiMessages.push({ role: "user", content: msg.content });
      } else if (msg.role === "assistant") {
        apiMessages.push({ role: "assistant", content: msg.content });
      }
    }

    // If images present, convert the last user message to multimodal format
    if (images.length > 0) {
      for (let i = apiMessages.length - 1; i >= 0; i--) {
        if (apiMessages[i].role === "user") {
          const text = apiMessages[i].content as string;
          const content: Array<Record<string, unknown>> = [{ type: "text", text }];
          for (const img of images) {
            content.push({ type: "image_url", image_url: { url: img } });
          }
          apiMessages[i] = { role: "user", content };
          break;
        }
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
    let savedConvId: number | null = null;
    let textChunks = 0;
    const generatedFiles: Array<{ path: string; language: string }> = [];

    const eventQueue: Array<Record<string, unknown>> = [];

    // SSE stream — drains from event queue
    const stream = new ReadableStream({
      async start(controller) {
        while (true) {
          while (eventQueue.length > 0) {
            const data = eventQueue.shift()!;
            try {
              controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`));
              if (data.type === "done") { controller.close(); return; }
            } catch { return; } // client disconnected
          }
          await new Promise(r => setTimeout(r, 50));
        }
      },
      cancel() { /* background task continues */ }
    });

    // AI agent loop — runs in background, survives client disconnect
    const agentPromise = (async () => {
      try {
        let currentMessages = [...apiMessages];
          let stepCount = 0;
          const maxSteps = 15;

          // Agent loop: keep calling until no more tool calls
          while (stepCount < maxSteps) {
            stepCount++;
            const response = await fetch(`${baseURL}${apiPath}`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
              },
              body: JSON.stringify({
                model: modelName,
                messages: currentMessages,
                tools: activeTools,
                tool_choice: "auto",
                temperature: 0.5,
                max_tokens: 8192,
                stream: true,
                reasoning_effort: "high",
              }),
            });

            if (!response.ok) {
              const errText = await response.text();
              console.error("DeepSeek API error:", response.status, errText.slice(0, 300));
              emit(eventQueue, { type: "error", content: `API ${response.status}: ${errText.slice(0, 150)}` });
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
                    textChunks++;
                    emit(eventQueue, { type: "text", content: delta.content });

                    // Save partial response to DB so it survives page reload
                    if (!savedConvId) {
                      const [row] = await db.insert(conversations).values({
                        projectId, userId,
                        role: "assistant",
                        content: fullResponse,
                      }).returning({ id: conversations.id });
                      savedConvId = row.id;
                    } else if (textChunks % 5 === 0) {
                      ctx.runInBackground(
                        db.update(conversations)
                          .set({ content: fullResponse })
                          .where(eq(conversations.id, savedConvId))
                      );
                    }
                  }

                  // Thinking/reasoning — stream to UI with throttling
                  if (delta.reasoning_content) {
                    reasoningContent += delta.reasoning_content;
                    // Emit thinking events (throttled: every 200 chars accumulated or on completion)
                    if (reasoningContent.length % 200 < delta.reasoning_content.length) {
                      emit(eventQueue, { type: "thinking", content: reasoningContent });
                    }
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
                          emit(eventQueue, { type: "tool_start", toolCallId: tc.id, name: tc.function?.name || "" });
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

            // Emit final thinking content
            if (reasoningContent) {
              emit(eventQueue, { type: "thinking", content: reasoningContent });
              emit(eventQueue, { type: "thinking_complete" });
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

              emit(eventQueue, { type: "tool_start", toolCallId: tc.id, name });
              emit(eventQueue, {
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
                    const lang = args.path.split(".").pop() || "text";
                    generatedFiles.push({ path: args.path, language: lang });
                    result = `File written: ${args.path}`;
                    emit(eventQueue, {
                      type: "file",
                      path: args.path,
                      language: lang,
                      content: args.content,
                      toolId: toolId,
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
                    const lang = args.path.split(".").pop() || "text";
                    // Track if not already in list
                    if (!generatedFiles.some((f) => f.path === args.path)) {
                      generatedFiles.push({ path: args.path, language: lang });
                    }
                    result = `File edited: ${args.path}`;
                    emit(eventQueue, {
                      type: "file",
                      path: args.path,
                      language: lang,
                      content,
                      toolId: toolId,
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
                  case "web_search": {
                    try {
                      const q = encodeURIComponent(args.query as string);
                      const searchRes = await fetch(`https://api.duckduckgo.com/?q=${q}&format=json&no_html=1`, {
                        headers: { "User-Agent": "Smart/1.0" },
                      });
                      if (searchRes.ok) {
                        const json = await searchRes.json() as any;
                        const items = json.Results || json.RelatedTopics || [];
                        result = items.slice(0, 5).map((r: any) => `${r.Text || r.Result || ""} — ${r.FirstURL || ""}`).join("\n") || "No results";
                      } else {
                        result = `Search failed: ${searchRes.status}`;
                      }
                    } catch { result = "Web search unavailable"; }
                    break;
                  }
                  case "smart_market": {
                    try {
                      const marketList = await db.select().from(marketListings).where(eq(marketListings.status, "approved")).limit(10);
                      result = marketList.map(item => `- ${item.title}: ${item.description || ""} (${item.type === "url" ? "外部链接" : "Smart 工具"})`).join("\n") || "暂无工具";
                    } catch { result = "Market unavailable"; }
                    break;
                  }
                  default:
                    result = `Unknown tool: ${name}`;
                }
              } catch (err) {
                result = `Tool error: ${String(err)}`;
              }

              emit(eventQueue, {
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

              // Save step to DB with file metadata for overview restoration
              ctx.runInBackground(
                (async () => {
                  const existingSteps = await db
                    .select()
                    .from(executionSteps)
                    .where(eq(executionSteps.toolId, toolId));

                  // Collect file info for write_file / edit_file steps
                  let fileMetadata = null;
                  if ((name === "write_file" || name === "edit_file") && args.path) {
                    fileMetadata = JSON.stringify([{ path: args.path, language: args.path.split(".").pop() || "text" }]);
                  }

                  await db.insert(executionSteps).values({
                    toolId,
                    stepOrder: existingSteps.length + 1,
                    type: name,
                    title: `${name}: ${argsStr.slice(0, 80)}`,
                    status: "completed",
                    detail: result.slice(0, 200),
                    terminalOutput: result.slice(0, 500),
                    metadata: fileMetadata,
                    startedAt: new Date().toISOString(),
                    completedAt: new Date().toISOString(),
                  });
                })()
              );
            }
          }

          // Save/update assistant message to DB
          if (savedConvId) {
            await db.update(conversations)
              .set({ content: fullResponse || "任务完成" })
              .where(eq(conversations.id, savedConvId));
          } else {
            await db.insert(conversations).values({
              projectId,
              userId,
              role: "assistant",
              content: fullResponse || "任务完成",
            });
          }

          // Update tool status with generated file list
          ctx.runInBackground(
            (async () => {
              await db
                .update(tools)
                .set({
                  status: "completed",
                  metadata: generatedFiles.length > 0 ? JSON.stringify(generatedFiles) : null,
                })
                .where(eq(tools.id, toolId));
            })()
          );

        emit(eventQueue, { type: "done", toolId });
      } catch (err) {
        if (savedConvId && fullResponse) {
          try {
            await db.update(conversations)
              .set({ content: fullResponse })
              .where(eq(conversations.id, savedConvId));
          } catch { /* ignore save error */ }
        }
        emit(eventQueue, { type: "error", content: String(err) });
        emit(eventQueue, { type: "done" });
      }
    })();

    ctx.runInBackground(agentPromise);

    return new Response(stream, { headers: SSE_HEADERS });
  });
