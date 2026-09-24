// 瘦循环：拼消息 → 调模型 → 策略钩子 → 执行工具 → 写回 session。页面语义全在 host。
import type { PhaseEvent } from "./events";
import type { SavedState, Session } from "./types";
import { compactIfNeeded, toSavedState } from "./session";
import type { CallLLM, LLMConfig, LLMResult } from "./llm";

export interface EngineToolResult {
  result: string;
  stop?: boolean;
}

export interface AfterToolCtx {
  name: string;
  args: Record<string, unknown>;
  id: string;
  denied: string | null;
  exec: EngineToolResult | null;
  session: Session;
}

export interface EngineHost {
  toolDefs: unknown[];
  maxRounds?: number;
  buildMessages: (session: Session) => Array<Record<string, unknown>>;
  checkPolicy?: (name: string, args: Record<string, unknown>, session: Session) => string | null | Promise<string | null>;
  executeTool: (name: string, args: Record<string, unknown>, session: Session) => Promise<EngineToolResult>;
  /** 返回 false 则本轮先不把模型流式事件交给页面（Work 要攒 text） */
  shouldYieldModelEvent?: (ev: PhaseEvent) => boolean;
  afterAssistant?: (ctx: { result: LLMResult; session: Session; hasTools: boolean }) => AsyncGenerator<PhaseEvent, void>;
  afterTool?: (ctx: AfterToolCtx) => AsyncGenerator<PhaseEvent, void>;
}

export interface LoopOutput {
  assistantText: string;
  waitingForUser: boolean;
}

function parseArgs(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw || "{}");
  } catch {
    return {};
  }
}

export async function* runEngineLoop(opts: {
  session: Session;
  modelConfig: LLMConfig;
  host: EngineHost;
  callLLM: CallLLM;
  onSaveState?: (state: SavedState) => Promise<void>;
}): AsyncGenerator<PhaseEvent, LoopOutput, undefined> {
  const { session, modelConfig, host, callLLM, onSaveState } = opts;
  const maxRounds = host.maxRounds ?? 20;
  session.waitingForUser = false;
  let assistantText = "";

  for (let round = 0; round < maxRounds; round++) {
    compactIfNeeded(session);
    const messages = host.buildMessages(session);
    const gen = callLLM(messages, host.toolDefs as Array<Record<string, unknown>>, modelConfig);
    let step = await gen.next();
    while (!step.done) {
      const ev = step.value;
      if (!ev) {
        step = await gen.next();
        continue;
      }
      if (host.shouldYieldModelEvent ? host.shouldYieldModelEvent(ev) : true) {
        yield ev;
      }
      step = await gen.next();
    }
    const result = (step.value || { textContent: "", reasoningContent: "", toolCalls: [] }) as LLMResult;
    const toolCalls = result.toolCalls || [];
    const hasTools = toolCalls.length > 0;

    session.events.push({
      type: "assistant",
      text: result.textContent || "",
      toolCalls: hasTools
        ? toolCalls.map((tc) => ({
          id: tc.id || `call_${round}_${tc.name}`,
          name: tc.name,
          args: tc.args,
        }))
        : undefined,
    });
    assistantText += result.textContent || "";

    if (host.afterAssistant) {
      yield* host.afterAssistant({ result, session, hasTools });
    } else if (result.textContent && !hasTools) {
      yield { type: "delta", phase: "text", text: result.textContent };
    }

    if (!hasTools) break;

    let stop = false;
    for (const tc of toolCalls) {
      const id = tc.id || `call_${round}_${tc.name}`;
      const args = parseArgs(tc.args);
      const denied = (await host.checkPolicy?.(tc.name, args, session)) ?? null;

      if (denied) {
        session.events.push({ type: "tool", id, name: tc.name, content: denied });
        if (host.afterTool) yield* host.afterTool({ name: tc.name, args, id, denied, exec: null, session });
        continue;
      }

      const exec = await host.executeTool(tc.name, args, session);
      session.events.push({ type: "tool", id, name: tc.name, content: exec.result });
      if (host.afterTool) yield* host.afterTool({ name: tc.name, args, id, denied: null, exec, session });
      if (exec.stop) {
        assistantText += exec.result;
        stop = true;
        break;
      }
    }
    if (stop) break;
  }

  if (onSaveState) await onSaveState(toSavedState(session));
  return { assistantText, waitingForUser: session.waitingForUser };
}
