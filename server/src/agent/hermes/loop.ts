import { emit } from "../stream";
import { db } from "edgespark";
import { eq } from "drizzle-orm";
import {
  loadAgentFiles,
  buildAgentSystemPrompt,
  buildConversationSummary,
  listAgentNames,
} from "./context";
import { workFiles, workMessages } from "@defs";

export interface HermesLoopParams {
  sessionId: number;
  userId: string;
  userMessage: string;
  targetAgent: string | null;
  modelConfig: {
    baseURL: string;
    apiPath: string;
    apiKey: string;
    modelName: string;
  };
  eventQueue: Array<Record<string, unknown>>;
  allFiles: Array<{ path: string; content: string }>;
}

export async function hermesLoop(params: HermesLoopParams): Promise<string> {
  const { sessionId, userMessage, targetAgent, modelConfig, eventQueue, allFiles } = params;
  let fullResponse = "";

  if (targetAgent) {
    // ── Sub-agent mode ──
    emit(eventQueue, { type: "agent_start", agentName: targetAgent });

    const agentCtx = await loadAgentFiles(sessionId, targetAgent);
    const agentSystemPrompt = buildAgentSystemPrompt(agentCtx);
    const summary = await buildConversationSummary(sessionId);

    const messages: Array<Record<string, unknown>> = [
      { role: "system", content: agentSystemPrompt },
    ];
    if (summary) {
      messages.push({ role: "system", content: `## Conversation Context\n\n${summary}` });
    }
    messages.push({ role: "user", content: userMessage });

    // Run agent loop (max 15 rounds)
    for (let step = 0; step < 15; step++) {
      const res = await fetch(`${modelConfig.baseURL}${modelConfig.apiPath}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${modelConfig.apiKey}`,
        },
        body: JSON.stringify({
          model: modelConfig.modelName,
          messages,
          tools: AGENT_TOOLS,
          tool_choice: "auto",
          temperature: 0.5,
          max_tokens: 8192,
          stream: true,
        }),
      });

      if (!res.ok || !res.body) {
        emit(eventQueue, { type: "error", message: `API error: ${res.status}` });
        break;
      }

      // Parse SSE stream — same pattern as existing loop.ts
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let textContent = "";
      const toolCallMap = new Map<number, { id: string; name: string; args: string }>();
      const toolCalls: Array<{ id: string; function: { name: string; arguments: string } }> = [];
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
          if (!data || data === "[DONE]") continue;

          try {
            const json = JSON.parse(data);
            const delta = json.choices?.[0]?.delta;

            if (delta?.content) {
              textContent += delta.content;
              emit(eventQueue, { type: "text", agentName: targetAgent, delta: delta.content });
            }

            if (delta?.tool_calls) {
              for (const tc of delta.tool_calls) {
                if (tc.index != null) {
                  if (tc.id) {
                    toolCallMap.set(tc.index, {
                      id: tc.id,
                      name: tc.function?.name || "",
                      args: tc.function?.arguments || "",
                    });
                  } else if (tc.function?.arguments) {
                    const existing = toolCallMap.get(tc.index);
                    if (existing) existing.args += tc.function.arguments;
                  }
                }
              }
            }
          } catch { /* skip malformed JSON lines */ }
        }
      }

      fullResponse += textContent;

      // Collect tool calls from map
      for (const [, tc] of toolCallMap) {
        toolCalls.push({
          id: tc.id,
          function: { name: tc.name, arguments: tc.args },
        });
      }

      // If no tool calls, we're done
      if (toolCalls.length === 0) {
        messages.push({ role: "assistant", content: textContent });
        break;
      }

      // Push assistant message with tool calls
      messages.push({
        role: "assistant",
        content: textContent || "",
        tool_calls: toolCalls.map((tc) => ({
          id: tc.id,
          type: "function",
          function: { name: tc.function.name, arguments: tc.function.arguments },
        })),
      });

      // Execute tools and push results
      for (const tc of toolCalls) {
        emit(eventQueue, {
          type: "tool_exec",
          toolName: tc.function.name,
          agentName: targetAgent,
        });

        let result: string;
        try {
          const args = JSON.parse(tc.function.arguments);
          result = await executeAgentTool(tc.function.name, args, sessionId, params, eventQueue);
        } catch (err: unknown) {
          result = `Error: ${err instanceof Error ? err.message : String(err)}`;
        }

        messages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: result,
        });
      }
    }

    // Save agent response as message
    await db.insert(workMessages).values({
      sessionId,
      agentName: targetAgent,
      role: "assistant",
      content: fullResponse,
    });

    // Update heartbeat
    const heartbeatPath = `agents/${targetAgent}/heartbeat.md`;
    const allHb = await db
      .select()
      .from(workFiles)
      .where(eq(workFiles.sessionId, sessionId));
    const existingHb = allHb.find((f) => f.path === heartbeatPath);
    const hbContent = `## Last Run\n- Time: ${new Date().toISOString()}\n- Status: completed\n`;
    if (existingHb) {
      await db
        .update(workFiles)
        .set({ content: hbContent, updatedAt: new Date().toISOString() })
        .where(eq(workFiles.id, existingHb.id));
    } else {
      await db.insert(workFiles).values({
        sessionId,
        path: heartbeatPath,
        content: hbContent,
      });
    }

    emit(eventQueue, { type: "agent_done", agentName: targetAgent });
  } else {
    // ── Direct Hermes chat (no agent) ──
    const summary = await buildConversationSummary(sessionId);
    const availableAgents = listAgentNames(allFiles);

    const messages: Array<Record<string, unknown>> = [
      {
        role: "system",
        content: `You are Hermes, a workflow coordinator. Available agents: ${availableAgents.join(", ") || "none yet"}. Help the user organize document-writing tasks.`,
      },
    ];
    if (summary) {
      messages.push({ role: "system", content: `Conversation:\n${summary}` });
    }
    messages.push({ role: "user", content: userMessage });

    const res = await fetch(`${modelConfig.baseURL}${modelConfig.apiPath}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${modelConfig.apiKey}`,
      },
      body: JSON.stringify({
        model: modelConfig.modelName,
        messages,
        temperature: 0.5,
        max_tokens: 4096,
        stream: true,
      }),
    });

    if (!res.ok || !res.body) {
      emit(eventQueue, { type: "error", message: `API error: ${res.status}` });
      return "";
    }

    const reader = res.body.getReader();
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
        if (!data || data === "[DONE]") continue;
        try {
          const content = JSON.parse(data).choices?.[0]?.delta?.content;
          if (content) {
            fullResponse += content;
            emit(eventQueue, { type: "text", delta: content });
          }
        } catch { /* skip malformed JSON lines */ }
      }
    }

    await db.insert(workMessages).values({
      sessionId,
      agentName: null,
      role: "assistant",
      content: fullResponse,
    });
  }

  return fullResponse;
}

// ── Agent Tools ──

async function executeAgentTool(
  name: string,
  args: Record<string, unknown>,
  sessionId: number,
  params: HermesLoopParams,
  eventQueue: Array<Record<string, unknown>>,
): Promise<string> {
  switch (name) {
    case "write_file": {
      const path = args.path as string | undefined;
      const content = args.content as string | undefined;
      if (!path || content === undefined) return "Error: path and content required";

      const allFiles = await db
        .select()
        .from(workFiles)
        .where(eq(workFiles.sessionId, sessionId));
      const existing = allFiles.find((f) => f.path === path);

      if (existing) {
        await db
          .update(workFiles)
          .set({ content, updatedAt: new Date().toISOString() })
          .where(eq(workFiles.id, existing.id));
      } else {
        await db.insert(workFiles).values({ sessionId, path, content });
      }
      emit(eventQueue, { type: "doc", path, delta: content });
      return `File written: ${path}`;
    }

    case "read_file": {
      const path = args.path as string | undefined;
      if (!path) return "Error: path required";
      const allFiles = await db
        .select()
        .from(workFiles)
        .where(eq(workFiles.sessionId, sessionId));
      const file = allFiles.find((f) => f.path === path);
      return file ? file.content || "" : `File not found: ${path}`;
    }

    case "web_search": {
      const query = args.query as string | undefined;
      if (!query) return "Error: query required";
      try {
        const res = await fetch(
          `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1`,
        );
        const data = (await res.json()) as Record<string, unknown>;
        return String(
          data.AbstractText || data.Abstract || JSON.stringify(data).slice(0, 1000),
        );
      } catch (err: unknown) {
        return `Search error: ${err instanceof Error ? err.message : String(err)}`;
      }
    }

    case "call_agent": {
      const agentName = args.name as string | undefined;
      const task = args.task as string | undefined;
      if (!agentName || !task) return "Error: name and task required";
      emit(eventQueue, { type: "agent_start", agentName });
      const result = await hermesLoop({
        ...params,
        userMessage: task,
        targetAgent: agentName,
      });
      emit(eventQueue, { type: "agent_done", agentName });
      return result;
    }

    case "list_files": {
      const prefix = args.prefix as string | undefined;
      const allFiles = await db
        .select()
        .from(workFiles)
        .where(eq(workFiles.sessionId, sessionId));
      const filtered = prefix
        ? allFiles.filter((f) => f.path.startsWith(prefix))
        : allFiles;
      return filtered
        .map((f) => `${f.isFolder ? "[dir]" : "[file]"} ${f.path}`)
        .join("\n");
    }

    default:
      return `Unknown tool: ${name}`;
  }
}

// Tool definitions for function calling
const AGENT_TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "call_agent",
      description: "Delegate a subtask to another agent",
      parameters: {
        type: "object" as const,
        properties: {
          name: { type: "string" as const, description: "Agent name" },
          task: { type: "string" as const, description: "Task description" },
        },
        required: ["name", "task"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "write_file",
      description: "Write content to a workspace file",
      parameters: {
        type: "object" as const,
        properties: {
          path: { type: "string" as const, description: "File path" },
          content: { type: "string" as const, description: "File content (markdown)" },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "read_file",
      description: "Read a workspace file",
      parameters: {
        type: "object" as const,
        properties: {
          path: { type: "string" as const, description: "File path" },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "list_files",
      description: "List workspace files",
      parameters: {
        type: "object" as const,
        properties: {
          prefix: { type: "string" as const, description: "Path prefix filter" },
        },
        required: [],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "web_search",
      description: "Search the web",
      parameters: {
        type: "object" as const,
        properties: {
          query: { type: "string" as const, description: "Search query" },
        },
        required: ["query"],
      },
    },
  },
];
