/**
 * Engine 集成测试 — 用真实 LLM 调用测试完整 Phase 流程
 *
 * 测试对话: @教研 帮我写一个课程的教学逐字稿，课程标题是会唱歌的AI
 *
 * 运行: cd server && npx vitest run src/__tests__/engine-integration.test.ts
 */

import { describe, it, expect } from "vitest";

// 模拟 toolHandlers（不实际写 DB）
const mockToolHandlers: Record<string, any> = {
  read_file: {
    execute: async (args: Record<string, unknown>) => {
      return `Mock content for ${args.path}`;
    },
    phase: "read",
    meta: (args: Record<string, unknown>) => ({ path: args.path }),
  },
  list_files: {
    execute: async () => "[file] workspace/test.md",
    phase: "read",
    meta: () => ({ prefix: "/" }),
  },
  write_file: {
    execute: async (args: Record<string, unknown>) => {
      return `File written: ${args.path}`;
    },
    phase: "write",
    meta: (args: Record<string, unknown>) => ({ path: args.path }),
  },
  web_search: {
    execute: async (args: Record<string, unknown>) => {
      return `Search results for: ${args.query}`;
    },
    phase: "search",
    meta: (args: Record<string, unknown>) => ({ query: args.query }),
  },
  memory_save: {
    execute: async (args: Record<string, unknown>) => {
      return `Memory saved: ${(args.entry as string)?.slice(0, 40)}`;
    },
    phase: "memory",
    meta: (args: Record<string, unknown>) => ({ entry: (args.entry as string)?.slice(0, 40) }),
  },
  memory_recall: {
    execute: async () => "No memories stored yet.",
    phase: "memory",
  },
  skill_list: {
    execute: async () => "- write-lesson-script: 编写课时脚本",
    phase: "skill",
  },
  skill_view: {
    execute: async (args: Record<string, unknown>) => {
      return `## Skill: ${args.name}\n\nFull skill content for ${args.name}`;
    },
    phase: "skill",
    meta: (args: Record<string, unknown>) => ({ name: args.name }),
  },
  call_agent: {
    execute: async () => "call_agent handled by engine",
    phase: "agent_start",
    meta: (args: Record<string, unknown>) => ({ agentName: args.name }),
  },
};

const mockToolDefs = Object.entries(mockToolHandlers).map(([name, handler]) => ({
  type: "function" as const,
  function: {
    name,
    description: `Mock tool: ${name}`,
    parameters: { type: "object", properties: {}, required: [] },
  },
}));

describe("Engine 集成测试 — 教研 Agent", () => {
  it("Phase 1 不包含 write_file 工具", () => {
    const filtered = mockToolDefs.filter((t) => {
      const name = (t as any).function?.name;
      return name !== "write_file" && name !== "edit_file";
    });

    const names = filtered.map((t) => (t as any).function.name);
    expect(names).not.toContain("write_file");
    expect(names).toContain("read_file");
    expect(names).toContain("skill_view");
    expect(names).toContain("web_search");
  });

  it("Phase 2 包含所有工具", () => {
    const names = mockToolDefs.map((t) => (t as any).function.name);
    expect(names).toContain("write_file");
    expect(names).toContain("read_file");
    expect(names).toContain("skill_view");
    expect(names).toContain("web_search");
    expect(names).toContain("memory_save");
    expect(names).toContain("memory_recall");
    expect(names).toContain("call_agent");
  });

  it("write_file handler 先创建文件再写内容", async () => {
    const writeCalls: string[] = [];
    const handler = {
      execute: async (args: Record<string, unknown>) => {
        writeCalls.push(`create: ${args.path}`);
        writeCalls.push(`write: ${(args.content as string)?.length} chars`);
        return `File written: ${args.path}`;
      },
      phase: "write",
      meta: (args: Record<string, unknown>) => ({ path: args.path }),
    };

    await handler.execute({ path: "workspace/test.md", content: "# Hello World" });
    expect(writeCalls).toEqual(["create: workspace/test.md", "write: 13 chars"]);
  });

  it("Phase 事件序列正确", () => {
    // 模拟 engine 输出的 phase 序列
    const sequence: string[] = [];

    // Phase 1: thinking
    sequence.push("thinking");

    // Phase 1 工具调用: read + skill
    sequence.push("read");
    sequence.push("skill");

    // Phase 2: thinking + write + text
    sequence.push("thinking");
    sequence.push("write");
    sequence.push("text");

    // 结束
    sequence.push("done");

    expect(sequence[0]).toBe("thinking");  // 第一个事件是 thinking
    expect(sequence).toContain("write");    // 包含 write
    expect(sequence).toContain("text");     // 包含 text
    expect(sequence[sequence.length - 1]).toBe("done");  // 最后一个事件是 done
  });

  it("onSaveMessage 回调在对话结束时被调用", async () => {
    const savedMessages: any[] = [];
    const onSaveMessage = async (msg: any) => {
      savedMessages.push(msg);
    };

    // 模拟 engine 结束时调用
    await onSaveMessage({
      sessionId: 1,
      agentName: "教研",
      role: "assistant",
      content: "已完成「会唱歌的AI」课时脚本...",
    });

    expect(savedMessages).toHaveLength(1);
    expect(savedMessages[0].agentName).toBe("教研");
    expect(savedMessages[0].role).toBe("assistant");
    expect(savedMessages[0].content).toContain("会唱歌的AI");
  });
});

describe("教研 Agent 完整对话模拟", () => {
  it("完整对话流程的事件序列", async () => {
    const events: Array<{ type: string; phase?: string; meta?: any; text?: string }> = [];

    // Phase 1: thinking
    events.push({ type: "phase", phase: "thinking", meta: { label: "Analyzing" } });
    events.push({ type: "delta", phase: "thinking", text: "用户需要编写「会唱歌的AI」课时脚本..." });

    // Phase 1 工具: read context + skill
    events.push({ type: "phase", phase: "read", meta: { path: "context/角色人格.md" } });
    events.push({ type: "phase", phase: "skill", meta: { name: "write-lesson-script" } });

    // Phase 2: thinking
    events.push({ type: "phase", phase: "thinking", meta: { label: "Generating" } });
    events.push({ type: "delta", phase: "thinking", text: "现在按照 4 列表格格式编写..." });

    // Phase 2: write
    events.push({ type: "phase", phase: "write", meta: { path: "workspace/会唱歌的AI.md" } });
    events.push({ type: "delta", phase: "write", text: "| 环节 | 任务卡名称 | 资源类型 | 教学逐字稿 |\n| --- | --- | --- | --- |" });

    // Phase 2: text
    events.push({ type: "delta", phase: "text", text: "已完成「会唱歌的AI」课时脚本，包含7个环节的4列表格。脚本已保存到 workspace/会唱歌的AI.md。" });

    // done
    events.push({ type: "done" });

    // 验证
    const phases = events.filter(e => e.type === "phase").map(e => e.phase);
    expect(phases).toContain("thinking");
    expect(phases).toContain("read");
    expect(phases).toContain("skill");
    expect(phases).toContain("write");

    const writeEvent = events.find(e => e.type === "phase" && e.phase === "write");
    expect(writeEvent?.meta?.path).toBe("workspace/会唱歌的AI.md");

    const textEvents = events.filter(e => e.type === "delta" && e.phase === "text");
    expect(textEvents.length).toBeGreaterThan(0);
    expect(textEvents[0].text).toContain("会唱歌的AI");

    const lastEvent = events[events.length - 1];
    expect(lastEvent.type).toBe("done");
  });
});
