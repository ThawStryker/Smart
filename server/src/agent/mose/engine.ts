import { loadAgentContext, loadSessionMessages, listAgentNames } from "./loader";
import { buildConversationSummary, buildAgentSystemPrompt } from "./context";
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

interface SSELineState {
  textContent: string;
  reasoningContent: string;
  toolCallMap: Map<number, { id: string; name: string; args: string }>;
}

interface SSELineResult {
  hasReasoning: boolean;
  reasoningText: string;
  hasText: boolean;
  textDelta: string;
}

function parseSSELine(data: string, state: SSELineState): SSELineResult {
  try {
    const json = JSON.parse(data);
    const delta = json.choices?.[0]?.delta;
    let hasReasoning = false;
    let reasoningText = "";
    let hasText = false;
    let textDelta = "";

    if (delta?.reasoning_content) {
      state.reasoningContent += delta.reasoning_content;
      hasReasoning = true;
      reasoningText = delta.reasoning_content;
    }

    if (delta?.content) {
      state.textContent += delta.content;
      hasText = true;
      textDelta = delta.content;
    }

    if (delta?.tool_calls) {
      for (const tc of delta.tool_calls) {
        if (tc.index != null) {
          if (tc.id) {
            state.toolCallMap.set(tc.index, {
              id: tc.id,
              name: tc.function?.name || "",
              args: tc.function?.arguments || "",
            });
          } else if (tc.function?.arguments) {
            const existing = state.toolCallMap.get(tc.index);
            if (existing) existing.args += tc.function.arguments;
          }
        }
      }
    }

    return { hasReasoning, reasoningText, hasText, textDelta };
  } catch {
    return { hasReasoning: false, reasoningText: "", hasText: false, textDelta: "" };
  }
}

// ── LLM 调用 + 流式解析 + phase 事件发射 ──
async function* callLLM(
  messages: Array<Record<string, unknown>>,
  tools: Array<Record<string, unknown>> | null,
  modelConfig: EngineInput["modelConfig"],
): AsyncGenerator<PhaseEvent, ParsedStream, unknown> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 300000);

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
      const body = await res.text().catch(() => "(no body)");
      yield { type: "error", message: `API ${res.status} model=${modelConfig.modelName} url=${modelConfig.baseURL}${modelConfig.apiPath} body=${body.slice(0, 200)}` };
      return { textContent: "", reasoningContent: "", toolCalls: [] };
    }

    // 流式读取并实时 yield thinking + text delta
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    const state: SSELineState = { textContent: "", reasoningContent: "", toolCallMap: new Map() };

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

        const result = parseSSELine(data, state);
        if (result.hasReasoning) {
          yield { type: "delta", phase: "thinking" as PhaseName, text: result.reasoningText };
        }
        if (result.hasText) {
          yield { type: "delta", phase: "text" as PhaseName, text: result.textDelta };
        }
      }
    }

    const toolCalls: Array<{ id: string; name: string; args: string }> = [];
    for (const [, tc] of state.toolCallMap) {
      toolCalls.push({ id: tc.id, name: tc.name, args: tc.args });
    }

    return { textContent: state.textContent, reasoningContent: state.reasoningContent, toolCalls };
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    if (err instanceof DOMException && err.name === "AbortError") {
      yield { type: "error", message: "Request timeout after 300s" };
    } else {
      yield { type: "error", message: `Request error: ${err instanceof Error ? err.message : String(err)}` };
    }
    return { textContent: "", reasoningContent: "", toolCalls: [] };
  }
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
      yield { type: "delta", phase: "write", text: parsedArgs.content as string, meta };
    }

    results.push({ tool_call_id: tc.id, content: result });
  }

  return results;
}

// ── Agent 模式：智能编排 + 工具循环 + Phase 事件 ──
// 加载 agent 资源（角色 + 行为准则 + 资源清单），
// 由模型动态决定读取哪些 memory/skill 文件，循环执行工具调用，emit Phase 事件供前端渲染。
async function* runAgent(input: EngineInput): EngineOutput {
  const { sessionId, userId, userMessage, targetAgent, modelConfig, toolHandlers, toolDefs, suppressSave, depth } = input;
  const agentName = targetAgent!;
  let fullResponse = "";
  let hasWrittenFile = false;

  // 加载 agent 上下文 + 对话历史
  const agentCtx = await loadAgentContext(userId, agentName);
  const msgs = await loadSessionMessages(sessionId);
  const summary = buildConversationSummary(msgs);

  // 构建 system prompt（角色 + 行为准则 + 资源清单 + 工作指引）
  const agentSystemPrompt = buildAgentSystemPrompt(agentCtx);

  // 组装消息
  const messages: Array<Record<string, unknown>> = [
    { role: "system", content: agentSystemPrompt },
  ];
  if (summary) {
    messages.push({ role: "system", content: `## Conversation Context\n\n${summary}` });
  }
  messages.push({ role: "user", content: userMessage });

  // yield agent_start
  yield { type: "phase", phase: "agent_start", meta: { agentName, depth } };

  // 工具循环（max 15 rounds）
  for (let step = 0; step < 15; step++) {
    const result = yield* callLLM(messages, toolDefs, modelConfig);

    fullResponse += result.textContent;

    // 无工具调用 → 结束
    if (result.toolCalls.length === 0) {
      if (result.textContent) {
        messages.push({ role: "assistant", content: result.textContent });
      }
      break;
    }

    // 推 assistant 消息（含工具调用）
    messages.push({
      role: "assistant",
      content: result.textContent || "",
      tool_calls: result.toolCalls.map(tc => ({
        id: tc.id,
        type: "function",
        function: { name: tc.name, arguments: tc.args },
      })),
    });

    // 执行工具
    const toolResults = yield* executeTools(result.toolCalls, toolHandlers);

    // 标记 write_file
    for (const tc of result.toolCalls) {
      if (tc.name === "write_file") hasWrittenFile = true;
    }

    // 推工具结果
    for (const tr of toolResults) {
      messages.push({ role: "tool", tool_call_id: tr.tool_call_id, content: tr.content });
    }
  }

  // 保存 agent 响应为消息
  if (!suppressSave && input.onSaveMessage) {
    await input.onSaveMessage({
      sessionId, agentName, role: "assistant",
      content: normalizeNewlines(fullResponse),
    });
  }

  yield { type: "phase", phase: "agent_done", meta: { agentName } };
  yield { type: "done" };
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
  // content 已实时 yield 为 text delta（callLLM 内处理）

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
