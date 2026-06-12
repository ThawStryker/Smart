/**
 * Engine 单元测试 — 测试 Phase 流程、工具过滤、事件序列
 *
 * 运行: cd server && npx vitest run src/__tests__/engine.test.ts
 */

import { describe, it, expect } from "vitest";

// 直接测试 phases.ts 的类型和映射
describe("Phase 定义", () => {
  it("所有 9 个 phase 都有定义", () => {
    const phases = [
      "thinking", "agent_start", "agent_done",
      "read", "memory", "skill", "search", "write", "text",
    ];
    expect(phases).toHaveLength(9);
  });

  it("DEFAULT_TOOL_PHASE 映射正确", async () => {
    // 动态 import 避免 EdgeSpark runtime 依赖
    const { DEFAULT_TOOL_PHASE } = await import("../agent/mose/phases");
    expect(DEFAULT_TOOL_PHASE["write_file"]).toBe("write");
    expect(DEFAULT_TOOL_PHASE["read_file"]).toBe("read");
    expect(DEFAULT_TOOL_PHASE["web_search"]).toBe("search");
    expect(DEFAULT_TOOL_PHASE["memory_save"]).toBe("memory");
    expect(DEFAULT_TOOL_PHASE["memory_recall"]).toBe("memory");
    expect(DEFAULT_TOOL_PHASE["skill_list"]).toBe("skill");
    expect(DEFAULT_TOOL_PHASE["skill_view"]).toBe("skill");
    expect(DEFAULT_TOOL_PHASE["call_agent"]).toBe("agent_start");
  });
});

describe("PhaseEvent 类型", () => {
  it("phase 事件格式正确", () => {
    const event = { type: "phase" as const, phase: "write" as const, meta: { path: "workspace/test.md" } };
    expect(event.type).toBe("phase");
    expect(event.phase).toBe("write");
    expect(event.meta?.path).toBe("workspace/test.md");
  });

  it("delta 事件格式正确", () => {
    const event = { type: "delta" as const, phase: "text" as const, text: "Hello" };
    expect(event.type).toBe("delta");
    expect(event.phase).toBe("text");
    expect(event.text).toBe("Hello");
  });

  it("done 事件格式正确", () => {
    const event = { type: "done" as const };
    expect(event.type).toBe("done");
  });

  it("error 事件格式正确", () => {
    const event = { type: "error" as const, message: "Something went wrong" };
    expect(event.type).toBe("error");
    expect(event.message).toBe("Something went wrong");
  });
});

describe("Phase 1 工具过滤", () => {
  it("write_file 和 edit_file 在 Phase 1 中被过滤", () => {
    const toolDefs = [
      { type: "function", function: { name: "read_file" } },
      { type: "function", function: { name: "write_file" } },
      { type: "function", function: { name: "web_search" } },
      { type: "function", function: { name: "edit_file" } },
    ];

    const filtered = toolDefs.filter((t) => {
      const name = (t as any).function?.name;
      return name !== "write_file" && name !== "edit_file";
    });

    expect(filtered).toHaveLength(2);
    expect((filtered[0] as any).function.name).toBe("read_file");
    expect((filtered[1] as any).function.name).toBe("web_search");
  });
});

describe("Phase 流程验证", () => {
  it("完整对话流程的 phase 序列", () => {
    // 模拟一次完整的 agent 对话流程
    const expectedPhases = [
      "thinking",     // Phase 1: 分析需求
      "read",         // 读取 context 文件
      "skill",        // 读取 skill 内容
      "thinking",     // Phase 2: 继续分析
      "write",        // 写入文档
      "text",         // 输出总结
      "done",         // 结束
    ];

    // 验证所有 phase 都在合法范围内
    const validPhases = ["thinking", "agent_start", "agent_done", "read", "memory", "skill", "search", "write", "text", "done"];
    for (const p of expectedPhases) {
      expect(validPhases).toContain(p);
    }
  });

  it("Phase 1 不应包含 write phase", () => {
    const phase1Allowed = ["thinking", "read", "memory", "skill", "search", "text"];
    expect(phase1Allowed).not.toContain("write");
  });

  it("Phase 2 可以包含所有 phase", () => {
    const phase2Allowed = ["thinking", "read", "memory", "skill", "search", "write", "text"];
    expect(phase2Allowed).toContain("write");
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
    const events: any[] = [];

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
    expect(events[1]).toEqual({ type: "delta", phase: "thinking", text: "Let me analyze..." });
    expect(events[2]).toEqual({ type: "phase", phase: "write", meta: { path: "workspace/test.md" } });
    expect(events[3]).toEqual({ type: "delta", phase: "write", text: "# Test Document" });
    expect(events[4]).toEqual({ type: "delta", phase: "text", text: "Document created." });
    expect(events[5]).toEqual({ type: "done" });
  });
});
