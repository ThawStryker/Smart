// 唯一循环：拼 prompt → 调模型 → 策略拦截 → 执行工具 → 写回日志
import type { PhaseEvent, PhaseName } from "../phases";
import type { FileStore, PromptContext, SavedState, Session } from "../types";
import { compactIfNeeded, deriveMessages, toSavedState } from "./session";
import { buildSystemPrompt } from "./prompt";
import { TOOL_DEFS, dispatchTool } from "./tools";
import { checkPolicy } from "../policy/observe";
import { callLLM, type LLMConfig, type LLMResult } from "../utils/llm-client";
import { resolvePath } from "./fs";
import { looksLikeMetaNotes, splitMetaNotes } from "./deliverable";

const MAX_ROUNDS = 20;
const WRITE_CHUNK = 2000;
const SHORT_REPLY_LIMIT = 400;

export interface LoopRuntime {
  callLLM: typeof callLLM;
  fs: FileStore;
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

export function looksLikeDocument(s: string): boolean {
  if (looksLikeMetaNotes(s)) return false;
  const t = (s || "").trim();
  if (!t) return false;
  if (t.startsWith("#") && t.includes("\n") && t.length >= 80) return true;
  if (t.length < 120) return false;
  if ((t.match(/^## /gm) || []).length >= 2) return true;
  if (t.includes("| ---") || t.includes("|---")) return true;
  return false;
}

function shouldYieldAsText(text: string, hasTools: boolean): boolean {
  if (!text.trim()) return false;
  if (looksLikeMetaNotes(text)) return true;
  if (looksLikeDocument(text)) return false;
  if (hasTools && text.length >= SHORT_REPLY_LIMIT) return false;
  return true;
}

async function* emitUserVisible(text: string, hasTools: boolean): AsyncGenerator<PhaseEvent> {
  const split = splitMetaNotes(text);
  if (split.notes && split.document && looksLikeDocument(split.document)) {
    if (!hasTools) {
      yield { type: "phase", phase: "write", meta: { path: "(unsaved)", mode: "create" } };
      yield* yieldWrite(split.document, { path: "(unsaved)", mode: "create" });
    }
    yield { type: "delta", phase: "text", text: split.notes };
    return;
  }
  if (shouldYieldAsText(text, hasTools)) {
    yield { type: "delta", phase: "text", text };
    return;
  }
  if (!hasTools && looksLikeDocument(text)) {
    yield { type: "phase", phase: "write", meta: { path: "(unsaved)", mode: "create" } };
    yield* yieldWrite(text, { path: "(unsaved)", mode: "create" });
  }
}

function toolProcessEvent(name: string, args: Record<string, unknown>): PhaseEvent | null {
  switch (name) {
    case "read_file": {
      const path = String(args.path || "");
      return { type: "phase", phase: "read", meta: { path: path ? resolvePath(path).displayPath : "", tool: "read_file" } };
    }
    case "list_files":
      return { type: "phase", phase: "read", meta: { path: String(args.prefix || "/"), tool: "list_files" } };
    case "write_file": {
      const path = String(args.path || "");
      return { type: "phase", phase: "write", meta: { path: path ? resolvePath(path).displayPath : "", mode: "create" } };
    }
    case "edit_file": {
      const path = String(args.path || "");
      return { type: "phase", phase: "write", meta: { path: path ? resolvePath(path).displayPath : "", mode: "edit" } };
    }
    case "skill_load":
      return { type: "phase", phase: "skill", meta: { name: String(args.name || "") } };
    case "memory_recall":
      return { type: "phase", phase: "memory", meta: { path: "memory/MEMORY.md" } };
    default:
      return null;
  }
}

async function* yieldWrite(content: string, meta: Record<string, unknown>): AsyncGenerator<PhaseEvent> {
  const mode = meta.mode as string | undefined;
  if (mode === "edit") {
    yield { type: "delta", phase: "write", text: content, meta };
    return;
  }
  if (content.length <= WRITE_CHUNK) {
    yield { type: "delta", phase: "write", text: content, meta };
    return;
  }
  for (let i = 0; i < content.length; i += WRITE_CHUNK) {
    yield { type: "delta", phase: "write", text: content.slice(i, i + WRITE_CHUNK), meta };
  }
}

export async function* runLoop(opts: {
  session: Session;
  promptCtx: PromptContext;
  modelConfig: LLMConfig;
  runtime: LoopRuntime;
  onSaveState?: (state: SavedState) => Promise<void>;
}): AsyncGenerator<PhaseEvent, LoopOutput, undefined> {
  const { session, promptCtx, modelConfig, runtime, onSaveState } = opts;
  session.waitingForUser = false;
  let assistantText = "";

  for (let round = 0; round < MAX_ROUNDS; round++) {
    compactIfNeeded(session);
    const messages: Array<Record<string, unknown>> = [
      { role: "system", content: buildSystemPrompt(promptCtx, session) },
      ...deriveMessages(session),
    ];

    const gen = runtime.callLLM(messages, TOOL_DEFS, modelConfig);
    let step = await gen.next();
    while (!step.done) {
      const ev = step.value;
      // 正文等本轮结束后再分流：有写文件工具时不把文档体流到 text 通道
      if (!(ev && ev.type === "delta" && ev.phase === "text")) {
        yield ev;
      }
      step = await gen.next();
    }
    const result = (step.value || { textContent: "", reasoningContent: "", toolCalls: [] }) as LLMResult;

    if (!result.toolCalls || result.toolCalls.length === 0) {
      if (result.textContent) {
        yield* emitUserVisible(result.textContent, false);
        assistantText += result.textContent;
        session.events.push({ type: "assistant", text: result.textContent });
      }
      break;
    }

    if (result.textContent) {
      yield* emitUserVisible(result.textContent, true);
    }
    assistantText += result.textContent || "";
    session.events.push({
      type: "assistant",
      text: result.textContent || "",
      toolCalls: result.toolCalls.map((tc) => ({
        id: tc.id || `call_${round}_${tc.name}`,
        name: tc.name,
        args: tc.args,
      })),
    });

    let stop = false;
    for (const tc of result.toolCalls) {
      const id = tc.id || `call_${round}_${tc.name}`;
      const args = parseArgs(tc.args);

      let exists = false;
      if (tc.name === "write_file" || tc.name === "edit_file") {
        const rec = await runtime.fs.stat(String(args.path || ""));
        exists = rec.exists;
      }
      const denied = checkPolicy(tc.name, args, session, exists);

      const processEv = toolProcessEvent(tc.name, args);
      if (processEv && processEv.type === "phase") {
        yield {
          type: "phase",
          phase: processEv.phase,
          meta: { ...(processEv.meta || {}), ...(denied ? { error: denied } : {}) },
        };
      }

      if (denied) {
        session.events.push({ type: "tool", id, name: tc.name, content: denied });
        // 拦截写入时仍把拟写内容送到文档通道，避免正文只出现在 text 里
        if (tc.name === "write_file" && args.content) {
          const path = String(args.path || "(unsaved)");
          const split = splitMetaNotes(String(args.content));
          if (split.notes) {
            yield { type: "delta", phase: "text", text: split.notes };
          }
          if (split.document) {
            yield* yieldWrite(split.document, {
              path: path === "(unsaved)" ? path : resolvePath(path).displayPath,
              mode: "create",
              preview: true,
              error: denied,
            });
          }
        }
        continue;
      }

      const exec = await dispatchTool(tc.name, args, runtime.fs, session);
      session.events.push({ type: "tool", id, name: tc.name, content: exec.result });

      if (!processEv && exec.phase !== "text") {
        const showRead = exec.phase !== "read" || !!exec.meta;
        if (showRead) {
          yield { type: "phase", phase: exec.phase as PhaseName, meta: exec.meta };
        }
      }
      if (exec.writeContent && exec.meta) {
        yield* yieldWrite(exec.writeContent, exec.meta);
      }
      if (exec.notes) {
        yield { type: "delta", phase: "text", text: exec.notes };
      }
      if (exec.stop) {
        yield { type: "delta", phase: "text", text: exec.result };
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
