// Work 服务层：文档/技能/记忆。循环在 agent/engine。
import type { PhaseEvent, EngineInput } from "./phases";
import type { SavedState } from "./types";
import { createSession } from "./core/session";
import { runLoop } from "./core/loop";
import { createD1FileStore } from "./core/d1-fs";
import { loadPromptContext } from "./capabilities/context";
import { buildYumiPrompt } from "./core/prompt";
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
      focusFile: input.focusFile,
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
  const { sessionId, userId, userMessage, modelConfig, focusFile } = input;
  let pinned: Parameters<typeof buildYumiPrompt>[0] = null;
  if (focusFile && userId) {
    const fs = createD1FileStore(userId, "");
    const rec = await fs.read(focusFile);
    pinned = rec.exists
      ? { path: rec.displayPath, content: rec.content }
      : { path: rec.displayPath, missing: true };
  }
  const messages: Array<Record<string, unknown>> = [
    { role: "system", content: buildYumiPrompt(pinned) },
    { role: "user", content: userMessage },
  ];

  let fullResponse = "";
  const gen = callLLM(messages, [], modelConfig);
  let result = await gen.next();
  while (!result.done) {
    const ev = result.value;
    if (ev.type === "delta" && ev.phase === "text" && ev.text) fullResponse += ev.text;
    yield ev;
    result = await gen.next();
  }
  if (!fullResponse && result.value?.textContent) fullResponse = result.value.textContent;

  if (input.onSaveMessage && fullResponse) {
    await input.onSaveMessage({ sessionId, agentName: null, role: "assistant", content: fullResponse });
  }
  yield { type: "done" };
}
