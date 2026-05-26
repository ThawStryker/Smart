import { emit } from "../stream";
import { executeAgentTool, AGENT_TOOLS } from "./tools";
import { db } from "edgespark";
import { eq } from "drizzle-orm";
import { loadAgentFiles, loadSessionMessages } from "./loader";
import {
  buildAgentSystemPrompt,
  buildConversationSummary,
  listAgentNames,
} from "./context";
import { workFiles, workMessages } from "@defs";
import type { HermesLoopParams } from "./types";

export async function hermesLoop(params: HermesLoopParams): Promise<string> {
  const { sessionId, userMessage, targetAgent, modelConfig, eventQueue, allFiles } = params;
  let fullResponse = "";

  if (targetAgent) {
    // ── Sub-agent mode ──
    emit(eventQueue, { type: "agent_start", agentName: targetAgent });

    const agentCtx = await loadAgentFiles(sessionId, targetAgent);
    const agentSystemPrompt = buildAgentSystemPrompt(agentCtx);
    const msgs = await loadSessionMessages(sessionId);
    const summary = buildConversationSummary(msgs);

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
          result = await executeAgentTool(tc.function.name, args, sessionId, params, eventQueue, hermesLoop);
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

    emit(eventQueue, { type: "agent_done", agentName: targetAgent });
  } else {
    // ── Direct Hermes chat (no agent) ──
    const msgs = await loadSessionMessages(sessionId);
    const summary = buildConversationSummary(msgs);
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
