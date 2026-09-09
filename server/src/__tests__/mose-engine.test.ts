/**
 * mose 金样：政策 + edit + session log。不调真实 LLM / D1。
 */
import { describe, it, expect } from "vitest";
import { createSession, compactIfNeeded, deriveMessages, markObserved, toSavedState } from "../agent/mose/core/session";
import { MemoryFileStore, resolvePath } from "../agent/mose/core/fs";
import { checkPolicy } from "../agent/mose/policy/observe";
import { dispatchTool } from "../agent/mose/core/tools";
import { buildSystemPrompt } from "../agent/mose/core/prompt";
import { runLoop } from "../agent/mose/core/loop";
import { splitMetaNotes } from "../agent/mose/core/deliverable";
import type { PromptContext } from "../agent/mose/types";
import type { LLMConfig, LLMResult } from "../agent/mose/utils/llm-client";
import type { PhaseEvent } from "../agent/mose/phases";

const emptyPrompt: PromptContext = {
  agentsMd: "You are a writing agent.",
  context: [],
  skillCatalog: [{ name: "lesson", description: "Write a lesson script" }],
  memoryIndex: [],
  userMd: "",
  memoryMd: "",
};

const modelConfig: LLMConfig = { baseURL: "", apiPath: "", apiKey: "", modelName: "test" };

function scriptedLLM(script: LLMResult[]) {
  let i = 0;
  return async function* callLLM(): AsyncGenerator<PhaseEvent, LLMResult> {
    const next = script[i++] || { textContent: "done", reasoningContent: "", toolCalls: [] };
    return next;
  };
}

describe("path resolve", () => {
  it("defaults bare markdown to workspace", () => {
    expect(resolvePath("a.md")).toEqual({
      kind: "workspace",
      storePath: "a.md",
      displayPath: "workspace/a.md",
    });
  });
  it("keeps agent skill paths", () => {
    expect(resolvePath("skills/lesson/SKILL.md").kind).toBe("agent");
  });
});

describe("observe policy", () => {
  it("rejects write_file on existing file", () => {
    const session = createSession();
    const msg = checkPolicy("write_file", { path: "workspace/a.md" }, session, true);
    expect(msg).toMatch(/already exists/);
    expect(msg).toMatch(/edit_file/);
  });

  it("rejects edit_file when file was not read", () => {
    const session = createSession();
    const msg = checkPolicy("edit_file", { path: "workspace/a.md" }, session, true);
    expect(msg).toMatch(/read_file first/);
  });

  it("allows edit_file after observe", () => {
    const session = createSession();
    markObserved(session, "workspace/a.md");
    expect(checkPolicy("edit_file", { path: "workspace/a.md" }, session, true)).toBeNull();
  });

  it("allows write_file for new file", () => {
    const session = createSession();
    expect(checkPolicy("write_file", { path: "workspace/a.md" }, session, false)).toBeNull();
  });
});

describe("edit_file", () => {
  it("rejects non-unique old_string", async () => {
    const fs = new MemoryFileStore();
    await fs.write("workspace/a.md", "foo\nfoo\n");
    const session = createSession();
    markObserved(session, "workspace/a.md");
    const r = await dispatchTool("edit_file", {
      path: "workspace/a.md",
      old_string: "foo",
      new_string: "bar",
    }, fs, session);
    expect(r.result).toMatch(/matched 2 times/);
  });

  it("applies unique replacement", async () => {
    const fs = new MemoryFileStore();
    await fs.write("workspace/a.md", "# Title\nhello world\n");
    const session = createSession();
    markObserved(session, "workspace/a.md");
    const r = await dispatchTool("edit_file", {
      path: "workspace/a.md",
      old_string: "hello world",
      new_string: "hello there",
    }, fs, session);
    expect(r.result).toMatch(/File edited/);
    const rec = await fs.read("workspace/a.md");
    expect(rec.content).toContain("hello there");
    expect(rec.content).not.toContain("hello world");
  });
});

describe("session log", () => {
  it("ask_user stops the loop and persists waitingForUser", async () => {
    const fs = new MemoryFileStore();
    const session = createSession();
    session.events.push({ type: "user", text: "帮我写一课" });
    let saved = toSavedState(session);

    const output = yieldCollect(runLoop({
      session,
      promptCtx: emptyPrompt,
      modelConfig,
      runtime: {
        callLLM: scriptedLLM([
          {
            textContent: "",
            reasoningContent: "",
            toolCalls: [{ id: "1", name: "ask_user", args: JSON.stringify({ question: "面向哪个年级？" }) }],
          },
        ]),
        fs,
      },
      onSaveState: async (s) => { saved = s; },
    }));

    const { events, result } = await output;
    expect(result.waitingForUser).toBe(true);
    expect(saved.waitingForUser).toBe(true);
    expect(events.some((e) => e.type === "delta" && "text" in e && e.text === "面向哪个年级？")).toBe(true);
  });

  it("skill_load injects body into the next system prompt", async () => {
    const fs = new MemoryFileStore();
    await fs.write("skills/lesson/SKILL.md", "# Lesson skill\nUse 7 sections.");
    const session = createSession();
    await dispatchTool("skill_load", { name: "lesson" }, fs, session);
    const prompt = buildSystemPrompt(emptyPrompt, session);
    expect(prompt).toContain("Loaded Skills");
    expect(prompt).toContain("Use 7 sections.");
  });

  it("compact truncates old tool results and keeps recent ones", () => {
    const session = createSession();
    for (let i = 0; i < 10; i++) {
      session.events.push({ type: "tool", id: `t${i}`, name: "read_file", content: "x".repeat(20_000) });
    }
    compactIfNeeded(session);
    const lengths = session.events.filter((e) => e.type === "tool").map((e) => e.content.length);
    expect(lengths.slice(0, 4).every((n) => n < 500)).toBe(true);
    expect(lengths.slice(-6).every((n) => n === 20_000)).toBe(true);
  });
});

describe("runLoop", () => {
  it("rejects unobserved edit via policy and does not change the file", async () => {
    const fs = new MemoryFileStore();
    await fs.write("workspace/a.md", "original");
    const session = createSession();
    session.events.push({ type: "user", text: "改一下" });

    await yieldCollect(runLoop({
      session,
      promptCtx: emptyPrompt,
      modelConfig,
      runtime: {
        callLLM: scriptedLLM([
          {
            textContent: "",
            reasoningContent: "",
            toolCalls: [{
              id: "1",
              name: "edit_file",
              args: JSON.stringify({ path: "workspace/a.md", old_string: "original", new_string: "changed" }),
            }],
          },
          { textContent: "need to read first", reasoningContent: "", toolCalls: [] },
        ]),
        fs,
      },
    }));

    expect((await fs.read("workspace/a.md")).content).toBe("original");
    const tools = session.events.filter((e) => e.type === "tool");
    expect(tools[0]?.content).toMatch(/read_file first/);
  });

  it("read then edit succeeds", async () => {
    const fs = new MemoryFileStore();
    await fs.write("workspace/a.md", "original");
    const session = createSession();
    session.events.push({ type: "user", text: "改成 changed" });

    await yieldCollect(runLoop({
      session,
      promptCtx: emptyPrompt,
      modelConfig,
      runtime: {
        callLLM: scriptedLLM([
          {
            textContent: "",
            reasoningContent: "",
            toolCalls: [{ id: "1", name: "read_file", args: JSON.stringify({ path: "workspace/a.md" }) }],
          },
          {
            textContent: "",
            reasoningContent: "",
            toolCalls: [{
              id: "2",
              name: "edit_file",
              args: JSON.stringify({ path: "workspace/a.md", old_string: "original", new_string: "changed" }),
            }],
          },
          { textContent: "已修改", reasoningContent: "", toolCalls: [] },
        ]),
        fs,
      },
    }));

    expect((await fs.read("workspace/a.md")).content).toBe("changed");
    expect(deriveMessages(session).some((m) => m.role === "assistant" && m.content === "已修改")).toBe(true);
  });

  it("routes leaked document text into write, not text", async () => {
    const fs = new MemoryFileStore();
    const session = createSession();
    session.events.push({ type: "user", text: "写一课" });
    const body = "# 课稿\n\n" + "内容".repeat(200);
    let round = 0;

    const { events } = await yieldCollect(runLoop({
      session,
      promptCtx: emptyPrompt,
      modelConfig,
      runtime: {
        callLLM: async function* () {
          if (round++ === 0) {
            yield { type: "delta", phase: "text", text: body };
            return {
              textContent: body,
              reasoningContent: "",
              toolCalls: [{
                id: "1",
                name: "write_file",
                args: JSON.stringify({ path: "workspace/lesson.md", content: body }),
              }],
            };
          }
          return { textContent: "已写好 workspace/lesson.md", reasoningContent: "", toolCalls: [] };
        },
        fs,
      },
    }));

    expect(events.some((e) => e.type === "delta" && e.phase === "text" && "text" in e && e.text === body)).toBe(false);
    expect(events.some((e) => e.type === "phase" && e.phase === "write" && e.meta?.path === "workspace/lesson.md")).toBe(true);
    const write = events.find((e) => e.type === "delta" && e.phase === "write");
    expect(write && "text" in write && write.text).toContain("# 课稿");
    expect((await fs.read("workspace/lesson.md")).content).toContain("# 课稿");
  });

  it("yields Read then Writing process events", async () => {
    const fs = new MemoryFileStore();
    await fs.write("workspace/a.md", "original");
    const session = createSession();
    session.events.push({ type: "user", text: "改一下" });

    const { events } = await yieldCollect(runLoop({
      session,
      promptCtx: emptyPrompt,
      modelConfig,
      runtime: {
        callLLM: scriptedLLM([
          {
            textContent: "",
            reasoningContent: "",
            toolCalls: [{ id: "1", name: "read_file", args: JSON.stringify({ path: "workspace/a.md" }) }],
          },
          {
            textContent: "",
            reasoningContent: "",
            toolCalls: [{
              id: "2",
              name: "edit_file",
              args: JSON.stringify({ path: "workspace/a.md", old_string: "original", new_string: "changed" }),
            }],
          },
          { textContent: "已改好", reasoningContent: "", toolCalls: [] },
        ]),
        fs,
      },
    }));

    const phases = events.filter((e) => e.type === "phase").map((e) => `${e.phase}:${e.meta?.path || ""}`);
    expect(phases).toContain("read:workspace/a.md");
    expect(phases).toContain("write:workspace/a.md");
    expect(events.some((e) => e.type === "delta" && e.phase === "text" && "text" in e && e.text === "已改好")).toBe(true);
  });

  it("still shows write content when policy denies overwrite", async () => {
    const fs = new MemoryFileStore();
    await fs.write("workspace/a.md", "original");
    const session = createSession();
    session.events.push({ type: "user", text: "重写" });
    const next = "# 新稿\n\n" + "段落".repeat(80);

    const { events } = await yieldCollect(runLoop({
      session,
      promptCtx: emptyPrompt,
      modelConfig,
      runtime: {
        callLLM: scriptedLLM([
          {
            textContent: next,
            reasoningContent: "",
            toolCalls: [{
              id: "1",
              name: "write_file",
              args: JSON.stringify({ path: "workspace/a.md", content: next }),
            }],
          },
          { textContent: "需要改用 edit_file", reasoningContent: "", toolCalls: [] },
        ]),
        fs,
      },
    }));

    expect((await fs.read("workspace/a.md")).content).toBe("original");
    const write = events.find((e) => e.type === "delta" && e.phase === "write");
    expect(write && "text" in write && write.text).toContain("# 新稿");
    expect(events.some((e) => e.type === "phase" && e.phase === "write" && e.meta?.error)).toBe(true);
  });

  it("puts 教学目标覆盖说明 in text, not in the file", async () => {
    const fs = new MemoryFileStore();
    const session = createSession();
    session.events.push({ type: "user", text: "写一课" });
    const lesson = "# 课稿\n\n" + "新知讲解".repeat(40);
    const notes = "教学目标覆盖说明\n目标 1（理解 AIGC）：承载于「新知讲解·AI 的“生成”魔法」＋「AIGC 分类小游戏」。\n目标 2（知道文生图）：承载于「文字怎么变成画」＋「文生图初体验」。\n目标 3（文生图技巧）：承载于「提示词三法宝」。";
    let round = 0;

    const { events } = await yieldCollect(runLoop({
      session,
      promptCtx: emptyPrompt,
      modelConfig,
      runtime: {
        callLLM: async function* () {
          if (round++ === 0) {
            return {
              textContent: "",
              reasoningContent: "",
              toolCalls: [{
                id: "1",
                name: "write_file",
                args: JSON.stringify({ path: "workspace/lesson.md", content: `${lesson}\n\n${notes}` }),
              }],
            };
          }
          return { textContent: "已写好", reasoningContent: "", toolCalls: [] };
        },
        fs,
      },
    }));

    const saved = (await fs.read("workspace/lesson.md")).content;
    expect(saved).toContain("# 课稿");
    expect(saved).not.toContain("教学目标覆盖说明");
    const textEv = events.find((e) => e.type === "delta" && e.phase === "text" && "text" in e && e.text.includes("教学目标覆盖说明"));
    expect(textEv).toBeTruthy();
    expect(events.some((e) => e.type === "phase" && e.phase === "write")).toBe(true);
  });

  it("routes coverage-only leftover text to Output", async () => {
    const notes = "教学目标覆盖说明\n目标 1（理解 AIGC）：承载于「新知讲解·AI 的“生成”魔法」＋「AIGC 分类小游戏」。\n目标 2（知道文生图）：承载于「文字怎么变成画」。\n目标 3（文生图技巧）：承载于「提示词三法宝」。";
    const fs = new MemoryFileStore();
    const session = createSession();
    session.events.push({ type: "user", text: "覆盖了吗" });

    const { events } = await yieldCollect(runLoop({
      session,
      promptCtx: emptyPrompt,
      modelConfig,
      runtime: {
        callLLM: scriptedLLM([{ textContent: notes, reasoningContent: "", toolCalls: [] }]),
        fs,
      },
    }));

    expect(events.some((e) => e.type === "delta" && e.phase === "write")).toBe(false);
    expect(events.some((e) => e.type === "delta" && e.phase === "text" && "text" in e && e.text.includes("教学目标覆盖说明"))).toBe(true);
  });
});

describe("splitMetaNotes", () => {
  it("splits trailing coverage block", () => {
    const { document, notes } = splitMetaNotes("# 课稿\n\n正文段落\n\n教学目标覆盖说明\n目标 1（理解 AIGC）：承载于「新知讲解」。\n");
    expect(document).toContain("# 课稿");
    expect(document).not.toContain("教学目标覆盖说明");
    expect(notes).toContain("教学目标覆盖说明");
    expect(notes).toContain("承载于");
  });
});

async function yieldCollect<T>(gen: AsyncGenerator<PhaseEvent, T>) {
  const events: PhaseEvent[] = [];
  let step = await gen.next();
  while (!step.done) {
    events.push(step.value);
    step = await gen.next();
  }
  return { events, result: step.value };
}
