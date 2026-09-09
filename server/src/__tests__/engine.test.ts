/**
 * Phase 映射 + SSE 封装。引擎行为见 mose-engine.test.ts。
 */
import { describe, it, expect } from "vitest";

describe("Phase 定义", () => {
  it("DEFAULT_TOOL_PHASE 映射正确", async () => {
    const { DEFAULT_TOOL_PHASE } = await import("../agent/mose/phases");
    expect(DEFAULT_TOOL_PHASE["write_file"]).toBe("write");
    expect(DEFAULT_TOOL_PHASE["edit_file"]).toBe("write");
    expect(DEFAULT_TOOL_PHASE["read_file"]).toBe("read");
    expect(DEFAULT_TOOL_PHASE["list_files"]).toBe("read");
    expect(DEFAULT_TOOL_PHASE["skill_load"]).toBe("skill");
    expect(DEFAULT_TOOL_PHASE["memory_recall"]).toBe("memory");
    expect(DEFAULT_TOOL_PHASE["ask_user"]).toBe("text");
  });
});

describe("SSE 流格式", () => {
  it("createPhaseSSEStream 输出标准 SSE 格式", async () => {
    const { createPhaseSSEStream } = await import("../agent/stream");

    async function* mockEvents() {
      yield { type: "phase" as const, phase: "thinking" as const, meta: { label: "Analyzing" } };
      yield { type: "delta" as const, phase: "thinking" as const, text: "Let me analyze..." };
      yield { type: "phase" as const, phase: "write" as const, meta: { path: "workspace/test.md" } };
      yield { type: "delta" as const, phase: "write" as const, text: "# Test Document" };
      yield { type: "delta" as const, phase: "text" as const, text: "Document created." };
      yield { type: "done" as const };
    }

    const stream = createPhaseSSEStream(mockEvents());
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    const events: unknown[] = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value, { stream: true });
      for (const line of text.split("\n")) {
        if (line.startsWith("data: ")) {
          events.push(JSON.parse(line.slice(6)));
        }
      }
    }

    expect(events).toHaveLength(6);
    expect(events[0]).toEqual({ type: "phase", phase: "thinking", meta: { label: "Analyzing" } });
    expect(events[5]).toEqual({ type: "done" });
  });
});
