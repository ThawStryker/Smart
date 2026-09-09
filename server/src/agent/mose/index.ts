// Mose：单循环 + session log + 先读后改。对外吐 PhaseEvent。
import type { PhaseEvent, EngineInput } from "./phases";
import type { SavedState } from "./types";
import { createSession } from "./core/session";
import { runLoop } from "./core/loop";
import { createD1FileStore } from "./core/d1-fs";
import { loadPromptContext } from "./capabilities/context";
import { callLLM } from "./utils/llm-client";

export type { SavedState, EngineInput };

export async function* run(
  input: EngineInput,
  savedState?: SavedState,
  onSaveState?: (state: SavedState) => Promise<void>,
): AsyncGenerator<PhaseEvent, void, undefined> {
  const { sessionId, userId, userMessage, targetAgent, modelConfig, suppressSave } = input;

  if (!targetAgent) {
    yield* runDirect(input);
    return;
  }

  yield { type: "phase", phase: "agent_start", meta: { agentName: targetAgent, depth: input.depth || 0 } };

  try {
    const session = createSession(savedState);
    session.events.push({ type: "user", text: userMessage });

    const fs = createD1FileStore(userId, targetAgent);
    const promptCtx = await loadPromptContext(userId, targetAgent);

    const output = yield* runLoop({
      session,
      promptCtx,
      modelConfig,
      runtime: { callLLM, fs },
      onSaveState,
    });

    if (!suppressSave && input.onSaveMessage && output.assistantText) {
      await input.onSaveMessage({
        sessionId,
        agentName: targetAgent,
        role: "assistant",
        content: output.assistantText,
      });
    }

    yield { type: "phase", phase: "agent_done", meta: { agentName: targetAgent } };
    yield { type: "done" };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    yield { type: "error", message: `引擎中断: ${msg}` };
    yield { type: "done" };
  }
}

async function* runDirect(input: EngineInput): AsyncGenerator<PhaseEvent, void, undefined> {
  const { sessionId, userMessage, modelConfig } = input;
  const messages: Array<Record<string, unknown>> = [
    { role: "user", content: userMessage },
  ];

  let fullResponse = "";
  const gen = callLLM(messages, [], modelConfig);
  let result = await gen.next();
  while (!result.done) {
    yield result.value;
    result = await gen.next();
  }
  if (result.value?.textContent) fullResponse = result.value.textContent;

  if (input.onSaveMessage && fullResponse) {
    await input.onSaveMessage({ sessionId, agentName: null, role: "assistant", content: fullResponse });
  }
  yield { type: "done" };
}
