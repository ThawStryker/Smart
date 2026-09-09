import type { PhaseEvent, PhaseName } from "../phases";

export interface LLMConfig {
  baseURL: string;
  apiPath: string;
  apiKey: string;
  modelName: string;
}

export interface LLMResult {
  textContent: string;
  reasoningContent: string;
  toolCalls: Array<{ id: string; name: string; args: string }>;
}

interface SSELineState {
  textContent: string;
  reasoningContent: string;
  toolCallMap: Map<number, { id: string; name: string; args: string }>;
}

function parseSSELine(data: string, state: SSELineState): { hasReasoning: boolean; reasoningText: string; hasText: boolean; textDelta: string } {
  try {
    const json = JSON.parse(data);
    const delta = json.choices?.[0]?.delta;
    let hasReasoning = false, reasoningText = "", hasText = false, textDelta = "";

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
          if (tc.id) state.toolCallMap.set(tc.index, { id: tc.id, name: tc.function?.name || "", args: tc.function?.arguments || "" });
          else if (tc.function?.arguments) {
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

function isRetryableNetwork(err: unknown): boolean {
  if (err instanceof DOMException && err.name === "AbortError") return false;
  const msg = err instanceof Error ? err.message : String(err);
  return /network|fetch|connection|econnreset|etimedout/i.test(msg);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchLLM(
  config: LLMConfig,
  body: Record<string, unknown>,
  signal: AbortSignal,
): Promise<Response> {
  return fetch(`${config.baseURL}${config.apiPath}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify(body),
    signal,
  });
}

export async function* callLLM(
  messages: Array<Record<string, unknown>>,
  tools: Array<Record<string, unknown>>,
  config: LLMConfig,
): AsyncGenerator<PhaseEvent, LLMResult, unknown> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 300000);

  const body: Record<string, unknown> = {
    model: config.modelName,
    messages,
    temperature: 0.5,
    stream: true,
  };
  if (tools && tools.length > 0) {
    body.tools = tools;
    body.tool_choice = "auto";
  }

  try {
    let res: Response | null = null;
    let lastErr = "";
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        res = await fetchLLM(config, body, controller.signal);
        break;
      } catch (err: unknown) {
        lastErr = err instanceof Error ? err.message : String(err);
        if (!isRetryableNetwork(err) || attempt === 2) {
          clearTimeout(timeoutId);
          yield { type: "error", message: `模型接口连接失败: ${lastErr}` };
          return { textContent: "", reasoningContent: "", toolCalls: [] };
        }
        yield { type: "delta", phase: "thinking" as PhaseName, text: `连接失败，重试 ${attempt + 1}/2…\n` };
        await sleep(400 * (attempt + 1));
      }
    }
    if (!res) {
      clearTimeout(timeoutId);
      yield { type: "error", message: `模型接口连接失败: ${lastErr}` };
      return { textContent: "", reasoningContent: "", toolCalls: [] };
    }

    clearTimeout(timeoutId);

    if (!res.ok || !res.body) {
      const errBody = await res.text().catch(() => "(no body)");
      yield { type: "error", message: `API ${res.status}: ${errBody.slice(0, 200)}` };
      return { textContent: "", reasoningContent: "", toolCalls: [] };
    }

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
      const msg = err instanceof Error ? err.message : String(err);
      yield { type: "error", message: `模型流读取失败: ${msg}` };
    }
    return { textContent: "", reasoningContent: "", toolCalls: [] };
  }
}
