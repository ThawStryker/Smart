import { loadAgentFiles, loadSessionMessages, listAgentNames } from "./loader";
import { buildAgentSystemPrompt, buildConversationSummary } from "./context";
import type { EngineInput, EngineOutput, PhaseEvent, PhaseName } from "./phases";

function normalizeNewlines(t: string): string {
  return t.replace(/\n{3,}/g, "\n\n");
}

// ── SSE 流解析辅助 ──
interface ParsedStream {
  textContent: string;
  reasoningContent: string;
  toolCalls: Array<{ id: string; name: string; args: string }>;
}

async function parseSSEStream(
  body: ReadableStream<Uint8Array>,
): Promise<ParsedStream> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let textContent = "";
  let reasoningContent = "";
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
      if (!data || data === "[DONE]") continue;

      try {
        const json = JSON.parse(data);
        const delta = json.choices?.[0]?.delta;

        if (delta?.reasoning_content) {
          reasoningContent += delta.reasoning_content;
        }

        if (delta?.content) {
          textContent += delta.content;
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
      } catch { /* skip malformed JSON */ }
    }
  }

  const toolCalls: Array<{ id: string; name: string; args: string }> = [];
  for (const [, tc] of toolCallMap) {
    toolCalls.push({ id: tc.id, name: tc.name, args: tc.args });
  }

  return { textContent, reasoningContent, toolCalls };
}

// ── LLM 调用 + 流式解析 + phase 事件发射 ──
async function* callLLM(
  messages: Array<Record<string, unknown>>,
  tools: Array<Record<string, unknown>> | null,
  modelConfig: EngineInput["modelConfig"],
): AsyncGenerator<PhaseEvent, ParsedStream, unknown> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  try {
    const body: Record<string, unknown> = {
      model: modelConfig.modelName,
      messages,
      temperature: 0.5,
      stream: true,
    };
    if (tools && tools.length > 0) {
      body.tools = tools;
      body.tool_choice = "auto";
    }

    const res = await fetch(`${modelConfig.baseURL}${modelConfig.apiPath}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${modelConfig.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok || !res.body) {
      yield { type: "error", message: `API error: ${res.status}` };
      return { textContent: "", reasoningContent: "", toolCalls: [] };
    }

    // 流式读取并实时 yield thinking delta
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let textContent = "";
    let reasoningContent = "";
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
        if (!data || data === "[DONE]") continue;

        try {
          const json = JSON.parse(data);
          const delta = json.choices?.[0]?.delta;

          if (delta?.reasoning_content) {
            reasoningContent += delta.reasoning_content;
            yield { type: "delta", phase: "thinking" as PhaseName, text: delta.reasoning_content };
          }

          if (delta?.content) {
            textContent += delta.content;
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
        } catch { /* skip malformed JSON */ }
      }
    }

    const toolCalls: Array<{ id: string; name: string; args: string }> = [];
    for (const [, tc] of toolCallMap) {
      toolCalls.push({ id: tc.id, name: tc.name, args: tc.args });
    }

    return { textContent, reasoningContent, toolCalls };
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    if (err instanceof DOMException && err.name === "AbortError") {
      yield { type: "error", message: "Request timeout after 30s" };
    } else {
      yield { type: "error", message: `Request error: ${err instanceof Error ? err.message : String(err)}` };
    }
    return { textContent: "", reasoningContent: "", toolCalls: [] };
  }
}

// ── 过滤 Phase 1 工具（排除 write_file） ──
function filterPhase1Tools(
  toolDefs: Array<Record<string, unknown>>,
  toolHandlers: Record<string, EngineInput["toolHandlers"][string]>,
) {
  const filteredDefs = toolDefs.filter((t) => {
    const name = (t as any).function?.name;
    return name !== "write_file" && name !== "edit_file";
  });
  const filteredHandlers: Record<string, EngineInput["toolHandlers"][string]> = {};
  for (const [name, handler] of Object.entries(toolHandlers)) {
    if (name !== "write_file" && name !== "edit_file") {
      filteredHandlers[name] = handler;
    }
  }
  return { toolDefs: filteredDefs, toolHandlers: filteredHandlers };
}

// ── 执行工具并 yield phase 事件 ──
async function* executeTools(
  toolCalls: Array<{ id: string; name: string; args: string }>,
  toolHandlers: Record<string, EngineInput["toolHandlers"][string]>,
): AsyncGenerator<PhaseEvent, Array<{ tool_call_id: string; content: string }>, unknown> {
  const results: Array<{ tool_call_id: string; content: string }> = [];

  for (const tc of toolCalls) {
    const handler = toolHandlers[tc.name];
    const phase = handler?.phase || "text";
    let parsedArgs: Record<string, unknown> = {};
    try { parsedArgs = JSON.parse(tc.args); } catch {}

    // 1. 先执行工具（write_file 创建文件+写内容）
    let result: string;
    try {
      result = await handler!.execute(parsedArgs);
    } catch (err: unknown) {
      result = `Error: ${err instanceof Error ? err.message : String(err)}`;
    }

    // 2. yield phase 事件（前端据此渲染卡片、刷新文件树、自动打开）
    const meta = handler?.meta ? handler.meta(parsedArgs) : undefined;
    yield { type: "phase", phase, meta };

    // 3. write_file 额外 yield delta 让前端流式写入编辑器
    if (phase === "write" && parsedArgs.content) {
      yield { type: "delta", phase: "write", text: parsedArgs.content as string };
    }

    results.push({ tool_call_id: tc.id, content: result });
  }

  return results;
}

// ── Agent 模式主循环 ──
async function* runAgent(input: EngineInput): EngineOutput {
  const { sessionId, userId, userMessage, targetAgent, modelConfig, toolHandlers, toolDefs, suppressSave, depth } = input;
  const agentName = targetAgent!;

  // 加载 agent 上下文
  const agentCtx = await loadAgentFiles(userId, agentName);
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

  // ── Phase 1: Thinking（无 write_file） ──
  yield { type: "phase", phase: "thinking", meta: { label: "Analyzing" } };

  const phase1Tools = filterPhase1Tools(toolDefs, toolHandlers);
  const p1Result = yield* callLLM(messages, phase1Tools.toolDefs, modelConfig);

  // thinking 阶段的 reasoning_content 已经实时 yield 了
  // content 如果有 tool_calls → thinking delta；否则 → text delta
  if (p1Result.textContent) {
    if (p1Result.toolCalls.length > 0) {
      yield { type: "delta", phase: "thinking", text: p1Result.textContent };
    } else {
      yield { type: "delta", phase: "text", text: p1Result.textContent };
    }
  }

  // 如果 Phase 1 没有 tool_calls，直接返回
  if (p1Result.toolCalls.length === 0) {
    const fullResponse = p1Result.textContent;

    if (!suppressSave && input.onSaveMessage) {
      await input.onSaveMessage({
        sessionId,
        agentName,
        role: "assistant",
        content: normalizeNewlines(fullResponse),
      });
    }

    yield { type: "done" };
    return;
  }

  // 执行 Phase 1 工具
  const p1ToolResults = yield* executeTools(p1Result.toolCalls, phase1Tools.toolHandlers);

  // 推送 assistant message + tool results
  const p1AssistantMsg: Record<string, unknown> = {
    role: "assistant",
    content: p1Result.textContent || "",
    tool_calls: p1Result.toolCalls.map((tc) => ({
      id: tc.id,
      type: "function",
      function: { name: tc.name, arguments: tc.args },
    })),
  };
  if (p1Result.reasoningContent) p1AssistantMsg.reasoning_content = p1Result.reasoningContent;
  messages.push(p1AssistantMsg);

  for (const tr of p1ToolResults) {
    messages.push({ role: "tool", tool_call_id: tr.tool_call_id, content: tr.content });
  }

  // ── Phase 2: 标准循环（全部工具可用） ──
  let fullResponse = p1Result.textContent;

  for (let step = 0; step < 15; step++) {
    const result = yield* callLLM(messages, toolDefs, modelConfig);

    if (result.textContent) {
      if (result.toolCalls.length > 0) {
        yield { type: "delta", phase: "thinking", text: result.textContent };
      } else {
        yield { type: "delta", phase: "text", text: result.textContent };
      }
    }

    fullResponse += result.textContent;

    if (result.toolCalls.length === 0) {
      const msg: Record<string, unknown> = { role: "assistant", content: result.textContent };
      if (result.reasoningContent) msg.reasoning_content = result.reasoningContent;
      messages.push(msg);
      break;
    }

    // 推送 assistant message
    const assistantMsg: Record<string, unknown> = {
      role: "assistant",
      content: result.textContent || "",
      tool_calls: result.toolCalls.map((tc) => ({
        id: tc.id,
        type: "function",
        function: { name: tc.name, arguments: tc.args },
      })),
    };
    if (result.reasoningContent) assistantMsg.reasoning_content = result.reasoningContent;
    messages.push(assistantMsg);

    // 检查是否有 call_agent，需要特殊处理（嵌套 Engine）
    const hasCallAgent = result.toolCalls.some((tc) => tc.name === "call_agent");

    if (hasCallAgent) {
      for (const tc of result.toolCalls) {
        if (tc.name === "call_agent") {
          let parsedArgs: Record<string, unknown> = {};
          try { parsedArgs = JSON.parse(tc.args); } catch {}

          const subAgentName = parsedArgs.name as string;
          const subTask = parsedArgs.task as string;
          const isSelfCall = subAgentName === agentName;

          if (!isSelfCall) {
            yield { type: "phase", phase: "agent_start", meta: { agentName: subAgentName } };
          }

          // 递归调用子 Engine
          const subInput: EngineInput = {
            ...input,
            userMessage: subTask,
            targetAgent: subAgentName,
            suppressSave: true,
            depth: (depth || 0) + 1,
          };
          yield* runAgent(subInput);

          if (!isSelfCall) {
            yield { type: "phase", phase: "agent_done", meta: { agentName: subAgentName } };
          }

          messages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: `Sub-agent ${subAgentName} completed.`,
          });
        } else {
          // 非 call_agent 工具走标准执行
          const toolResults = yield* executeTools(
            [{ id: tc.id, name: tc.name, args: tc.args }],
            toolHandlers,
          );
          for (const tr of toolResults) {
            messages.push({ role: "tool", tool_call_id: tr.tool_call_id, content: tr.content });
          }
        }
      }
    } else {
      const toolResults = yield* executeTools(result.toolCalls, toolHandlers);
      for (const tr of toolResults) {
        messages.push({ role: "tool", tool_call_id: tr.tool_call_id, content: tr.content });
      }
    }
  }

  if (!suppressSave && input.onSaveMessage) {
    await input.onSaveMessage({
      sessionId,
      agentName,
      role: "assistant",
      content: normalizeNewlines(fullResponse),
    });
  }

  // 只有顶层 Engine 才 yield done
  if (!depth || depth === 0) {
    yield { type: "done" };
  }
}

// ── 直接聊天模式（Yumi） ──
async function* runDirect(input: EngineInput): EngineOutput {
  const { sessionId, userId, userMessage, modelConfig } = input;

  const msgs = await loadSessionMessages(sessionId);
  const summary = buildConversationSummary(msgs);
  const availableAgents = await listAgentNames(userId);

  const messages: Array<Record<string, unknown>> = [
    {
      role: "system",
      content: `You are Yumi, a workflow coordinator. Available agents: ${availableAgents.join(", ") || "none yet"}. Help the user organize document-writing tasks.`,
    },
  ];
  if (summary) {
    messages.push({ role: "system", content: `Conversation:\n${summary}` });
  }
  messages.push({ role: "user", content: userMessage });

  yield { type: "phase", phase: "thinking", meta: { label: "Thinking" } };

  const result = yield* callLLM(messages, null, modelConfig);

  // reasoning_content 已实时 yield 为 thinking delta
  // content → text delta
  if (result.textContent) {
    yield { type: "delta", phase: "text", text: result.textContent };
  }

  if (input.onSaveMessage) {
    await input.onSaveMessage({
      sessionId,
      agentName: null,
      role: "assistant",
      content: normalizeNewlines(result.textContent),
    });
  }

  yield { type: "done" };
}

// ── 主入口 ──
export async function* run(input: EngineInput): EngineOutput {
  if (input.targetAgent) {
    yield* runAgent(input);
  } else {
    yield* runDirect(input);
  }
}
