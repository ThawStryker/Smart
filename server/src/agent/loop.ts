import { db, ctx } from "edgespark";
import { eq } from "drizzle-orm";
import { conversations } from "@defs";
import { emit } from "./stream";
import { executeTool, type ExecContext } from "./executor";
import type { ToolDef } from "./tools/builtin";

interface LoopParams {
  baseURL: string;
  apiPath: string;
  apiKey: string;
  modelName: string;
  selectedModel: string;
  initialMessages: Array<Record<string, unknown>>;
  activeTools: ToolDef[];
  mcpMap: Map<string, Record<string, unknown>>;
  execCtx: ExecContext;
  userId: string;
  projectId: number;
  eventQueue: Array<Record<string, unknown>>;
}

interface LoopResult {
  fullResponse: string;
  savedConvId: number | null;
}

export async function agentLoop(params: LoopParams): Promise<LoopResult> {
  const { baseURL, apiPath, apiKey, modelName, selectedModel, initialMessages, activeTools, mcpMap, execCtx, userId, projectId, eventQueue } = params;

  let currentMessages = [...initialMessages];
  let fullResponse = "";
  let savedConvId: number | null = null;
  let textChunks = 0;
  const maxSteps = 15;

  for (let step = 0; step < maxSteps; step++) {
    const response = await fetch(`${baseURL}${apiPath}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: modelName,
        messages: currentMessages,
        tools: activeTools,
        tool_choice: "auto",
        temperature: 0.5,
        max_tokens: 8192,
        stream: true,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI API error:", response.status, errText.slice(0, 300));
      emit(eventQueue, { type: "error", content: `API ${response.status}: ${errText.slice(0, 150)}` });
      break;
    }

    // Parse SSE stream
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let assistantContent = "";
    let reasoningContent = "";
    const toolCallMap = new Map<number, { id: string; name: string; args: string }>();
    const toolCalls: Array<{ id: string; function: { name: string; arguments: string } }> = [];

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

          if (delta.content) {
            assistantContent += delta.content;
            fullResponse += delta.content;
            textChunks++;
            emit(eventQueue, { type: "text", content: delta.content });

            if (!savedConvId) {
              const [row] = await db.insert(conversations).values({
                projectId, userId, role: "assistant", content: fullResponse,
              }).returning({ id: conversations.id });
              savedConvId = row.id;
            } else if (textChunks % 5 === 0) {
              ctx.runInBackground(
                db.update(conversations).set({ content: fullResponse }).where(eq(conversations.id, savedConvId))
              );
            }
          }

          if (delta.reasoning_content) {
            reasoningContent += delta.reasoning_content;
            if (reasoningContent.length % 200 < (delta.reasoning_content as string).length) {
              emit(eventQueue, { type: "thinking", content: reasoningContent });
            }
          }

          if (delta.tool_calls) {
            for (const tc of delta.tool_calls) {
              if (tc.index != null) {
                if (tc.id) {
                  toolCallMap.set(tc.index, { id: tc.id, name: tc.function?.name || "", args: tc.function?.arguments || "" });
                  emit(eventQueue, { type: "tool_start", toolCallId: tc.id, name: tc.function?.name || "" });
                } else if (tc.function?.arguments) {
                  const existing = toolCallMap.get(tc.index);
                  if (existing) existing.args += tc.function.arguments;
                }
              }
            }
          }
        } catch {}
      }
    }

    if (reasoningContent) {
      emit(eventQueue, { type: "thinking", content: reasoningContent });
      emit(eventQueue, { type: "thinking_complete" });
    }

    for (const [, tc] of toolCallMap) {
      toolCalls.push({ id: tc.id, function: { name: tc.name, arguments: tc.args } });
    }

    if (toolCalls.length === 0) break;

    // Build assistant message
    const assistantMsg: Record<string, unknown> = { role: "assistant" };
    if (reasoningContent) assistantMsg.reasoning_content = reasoningContent;
    assistantMsg.content = assistantContent || "";
    assistantMsg.tool_calls = toolCalls.map(tc => ({
      id: tc.id, type: "function",
      function: { name: tc.function.name, arguments: tc.function.arguments },
    }));
    currentMessages.push(assistantMsg);

    // Execute tools
    for (const tc of toolCalls) {
      const { name, arguments: argsStr } = tc.function;
      emit(eventQueue, { type: "tool_start", toolCallId: tc.id, name });
      emit(eventQueue, { type: "tool_exec", toolCallId: tc.id, name, input: argsStr });

      const result = await executeTool(name, argsStr, execCtx, mcpMap);

      emit(eventQueue, { type: "tool_result", toolCallId: tc.id, name, output: result.slice(0, 500) });
      currentMessages.push({ role: "tool", tool_call_id: tc.id, content: result });
    }
  }

  return { fullResponse, savedConvId };
}
