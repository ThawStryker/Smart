import { describe, it, expect } from "vitest";
import { createSession, runEngineLoop } from "../agent/engine";
import type { LLMResult } from "../agent/engine/llm";
import type { PhaseEvent } from "../agent/engine/events";

const modelConfig = { baseURL: "", apiPath: "", apiKey: "", modelName: "test" };

function scriptedLLM(script: LLMResult[]) {
  let i = 0;
  return async function* callLLM(): AsyncGenerator<PhaseEvent, LLMResult> {
    const next = script[i++] || { textContent: "done", reasoningContent: "", toolCalls: [] };
    if (next.textContent) yield { type: "delta", phase: "text", text: next.textContent };
    return next;
  };
}

describe("runEngineLoop", () => {
  it("runs a text-only turn through the host", async () => {
    const session = createSession();
    session.events.push({ type: "user", text: "hi" });
    const tools: string[] = [];
    const gen = runEngineLoop({
      session,
      modelConfig,
      callLLM: scriptedLLM([{ textContent: "hello", reasoningContent: "", toolCalls: [] }]),
      host: {
        toolDefs: [],
        buildMessages: () => [{ role: "user", content: "hi" }],
        executeTool: async (name) => {
          tools.push(name);
          return { result: "ok" };
        },
      },
    });
    const events: PhaseEvent[] = [];
    let step = await gen.next();
    while (!step.done) {
      events.push(step.value);
      step = await gen.next();
    }
    expect(step.value.assistantText).toBe("hello");
    expect(tools).toEqual([]);
    expect(events.some((e) => e.type === "delta" && e.phase === "text")).toBe(true);
  });

  it("executes a tool then replies", async () => {
    const session = createSession();
    const ran: string[] = [];
    const gen = runEngineLoop({
      session,
      modelConfig,
      callLLM: scriptedLLM([
        { textContent: "", reasoningContent: "", toolCalls: [{ id: "1", name: "ping", args: "{}" }] },
        { textContent: "pong", reasoningContent: "", toolCalls: [] },
      ]),
      host: {
        toolDefs: [],
        buildMessages: () => [],
        executeTool: async (name) => {
          ran.push(name);
          return { result: "ok" };
        },
      },
    });
    let step = await gen.next();
    while (!step.done) step = await gen.next();
    expect(ran).toEqual(["ping"]);
    expect(step.value.assistantText).toBe("pong");
  });
});
