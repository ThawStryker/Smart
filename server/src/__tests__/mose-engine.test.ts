/**
 * mose 金样：政策 + edit + session log。不调真实 LLM / D1。
 */
import { describe, it, expect } from "vitest";
import { createSession, compactIfNeeded, deriveMessages, markObserved, toSavedState } from "../agent/mose/core/session";
import { MemoryFileStore, resolvePath } from "../agent/mose/core/fs";
import { checkPolicy } from "../agent/mose/policy/observe";
import { dispatchTool } from "../agent/mose/core/tools";
import { buildSystemPrompt, buildYumiPrompt } from "../agent/mose/core/prompt";
import { runLoop } from "../agent/mose/core/loop";
import { splitMetaNotes } from "../agent/mose/core/deliverable";
import type { PromptContext } from "../agent/mose/types";
import type { LLMConfig, LLMResult } from "../agent/mose/utils/llm-client";
import type { PhaseEvent } from "../agent/mose/phases";

const emptyPrompt: PromptContext = {
  agentsMd: "You are a writing agent.",
  context: [],
  contextPaths: [],
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

  it("rejects listing the whole workspace", () => {
    const session = createSession();
    session.events.push({ type: "user", text: "写一份教学逐字稿" });
    expect(checkPolicy("list_files", { prefix: "" }, session, false)).toMatch(/Do not list the workspace/);
    expect(checkPolicy("list_files", { prefix: "workspace" }, session, false)).toMatch(/Do not list the workspace/);
  });

  it("allows listing workspace when the user asked", () => {
    const session = createSession();
    session.events.push({ type: "user", text: "工作区里有哪些文件" });
    expect(checkPolicy("list_files", { prefix: "" }, session, false)).toBeNull();
  });

  it("allows listing agent skill files", () => {
    const session = createSession();
    expect(checkPolicy("list_files", { prefix: "skills/" }, session, false)).toBeNull();
  });

  it("rejects reading unrelated workspace files", () => {
    const session = createSession();
    session.events.push({ type: "user", text: "写一份新课稿" });
    expect(checkPolicy("read_file", { path: "workspace/新文件.md" }, session, true)).toMatch(/Do not read/);
    expect(checkPolicy("read_file", { path: "workspace/摄像头模块-教学逐字稿.md" }, session, true)).toMatch(/Do not read/);
  });

  it("allows reading the pinned file or a named file", () => {
    const session = createSession();
    session.events.push({ type: "user", text: "改一下封面" });
    expect(checkPolicy("read_file", { path: "workspace/课稿.md" }, session, true, { focusFile: "workspace/课稿.md" })).toBeNull();
    session.events.push({ type: "user", text: "改 #麦克风模块-教学逐字稿.md 的引入" });
    expect(checkPolicy("read_file", { path: "workspace/麦克风模块-教学逐字稿.md" }, session, true)).toBeNull();
  });

  it("does not reread a previous workspace file when another is pinned this turn", () => {
    const session = createSession();
    markObserved(session, "workspace/AI的身体-教案.md");
    session.events.push({ type: "user", text: "用户本轮指定文档：workspace/逐字稿.md\n写教案" });
    expect(checkPolicy("read_file", { path: "workspace/逐字稿.md" }, session, true, { focusFile: "workspace/逐字稿.md" })).toBeNull();
    expect(checkPolicy("read_file", { path: "workspace/AI的身体-教案.md" }, session, true, { focusFile: "workspace/逐字稿.md" })).toMatch(/Do not read/);
  });

  it("allows reading agent memory files", () => {
    const session = createSession();
    expect(checkPolicy("read_file", { path: "memory/青少年认知适配.md" }, session, true)).toBeNull();
  });

  it("rejects skill_load before memory files are read", () => {
    const session = createSession();
    const ctx = { memoryIndex: [{ path: "memory/world.md" }, { path: "memory/grade.md" }] };
    expect(checkPolicy("skill_load", { name: "lesson" }, session, false, ctx)).toMatch(/Read relevant memory/);
    markObserved(session, "memory/world.md");
    expect(checkPolicy("skill_load", { name: "lesson" }, session, false, ctx)).toMatch(/memory\/grade.md/);
    markObserved(session, "memory/grade.md");
    expect(checkPolicy("skill_load", { name: "lesson" }, session, false, ctx)).toBeNull();
  });

  it("allows skill_load when there is no memory index", () => {
    const session = createSession();
    expect(checkPolicy("skill_load", { name: "lesson" }, session, false, { memoryIndex: [] })).toBeNull();
  });

  it("rejects writes to memory/MEMORY.md", () => {
    const session = createSession();
    markObserved(session, "memory/MEMORY.md");
    expect(checkPolicy("edit_file", { path: "memory/MEMORY.md" }, session, true)).toMatch(/written by the user/);
    expect(checkPolicy("write_file", { path: "memory/MEMORY.md" }, session, false)).toMatch(/written by the user/);
  });

  it("allows edit_file on memory/USER.md after observe", () => {
    const session = createSession();
    markObserved(session, "memory/USER.md");
    expect(checkPolicy("edit_file", { path: "memory/USER.md" }, session, true)).toBeNull();
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

  it("lists memory files before skills and requires reading them before skill_load", () => {
    const prompt = buildSystemPrompt({
      ...emptyPrompt,
      memoryIndex: [{ path: "memory/world.md", summary: "worldview" }],
    }, createSession());
    const mem = prompt.indexOf("## Memory Files");
    const skills = prompt.indexOf("## Available Skills");
    expect(mem).toBeGreaterThan(-1);
    expect(skills).toBeGreaterThan(mem);
    expect(prompt).toMatch(/before skill_load/);
    expect(prompt).toMatch(/USER\.md, and MEMORY\.md are already fully loaded/);
  });

  it("adds a focus-file instruction when a document is pinned", () => {
    const prompt = buildSystemPrompt(emptyPrompt, createSession(), "workspace/课稿.md");
    expect(prompt).toContain("## 指定文档");
    expect(prompt).toContain("workspace/课稿.md");
    expect(prompt).toMatch(/edit_file/);
    expect(prompt).toMatch(/另写新文件/);
    expect(prompt).toMatch(/本轮/);
  });

  it("names the direct-chat assistant Yumi", () => {
    const prompt = buildYumiPrompt();
    expect(prompt).toMatch(/Yumi/);
    expect(prompt).toMatch(/不要自称/);
  });

  it("embeds a pinned workspace file into the Yumi prompt", () => {
    const prompt = buildYumiPrompt({ path: "workspace/逐字稿.md", content: "| 环节 | 任务卡 |\n封面 | 开场 |" });
    expect(prompt).toContain("workspace/逐字稿.md");
    expect(prompt).toContain("| 环节 | 任务卡 |");
    expect(prompt).toMatch(/不要说没有权限/);
  });

  it("does not claim missing permission when the pinned file is absent", () => {
    const prompt = buildYumiPrompt({ path: "workspace/没有.md", missing: true });
    expect(prompt).toContain("workspace/没有.md");
    expect(prompt).toMatch(/没有这份文件/);
  });

  it("states USER.md is writable conventions and MEMORY.md is user-authored", () => {
    const prompt = buildSystemPrompt({
      ...emptyPrompt,
      userMd: "- 封面用大白话",
      memoryMd: "- 禁用某梗",
    }, createSession());
    expect(prompt).toContain("## User Memory");
    expect(prompt).toContain("封面用大白话");
    expect(prompt).toMatch(/memory\/USER\.md/);
    expect(prompt).toContain("## Agent Memory");
    expect(prompt).toContain("禁用某梗");
    expect(prompt).toMatch(/Do not edit `memory\/MEMORY\.md`/);
    expect(prompt).toMatch(/skill_load at most one/);
    expect(prompt).toMatch(/Forbidden on memory\/MEMORY\.md/);
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
      focusFile: "workspace/a.md",
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
      focusFile: "workspace/a.md",
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

  it("does not write (unsaved) when model dumps a document without write_file", async () => {
    const body = "# 课稿\n\n" + "内容".repeat(200);
    const fs = new MemoryFileStore();
    const session = createSession();
    session.events.push({ type: "user", text: "写一课" });

    const { events } = await yieldCollect(runLoop({
      session,
      promptCtx: emptyPrompt,
      modelConfig,
      runtime: {
        callLLM: scriptedLLM([{ textContent: body, reasoningContent: "", toolCalls: [] }]),
        fs,
      },
    }));

    expect(events.some((e) => e.meta?.path === "(unsaved)")).toBe(false);
    expect(events.some((e) => e.type === "delta" && e.phase === "write")).toBe(false);
    expect(events.some((e) => e.type === "delta" && e.phase === "text" && "text" in e && e.text === body)).toBe(true);
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
