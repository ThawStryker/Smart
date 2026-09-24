// Work 服务层：文档可见性、先读后改、技能/记忆。循环本身在 engine。
import type { PhaseEvent, PhaseName } from "../phases";
import type { FileStore, PromptContext, SavedState, Session } from "../types";
import { deriveMessages, markObserved } from "./session";
import { buildSystemPrompt } from "./prompt";
import { TOOL_DEFS, dispatchTool } from "./tools";
import { checkPolicy } from "../policy/observe";
import { callLLM, type LLMConfig } from "../utils/llm-client";
import { resolvePath } from "./fs";
import { looksLikeMetaNotes, splitMetaNotes } from "./deliverable";
import { runEngineLoop, type LoopOutput } from "../../engine/loop";

export interface LoopRuntime {
  callLLM: typeof callLLM;
  fs: FileStore;
}

export type { LoopOutput };

const WRITE_CHUNK = 2000;
const SHORT_REPLY_LIMIT = 400;

function looksLikeDocument(s: string): boolean {
  if (looksLikeMetaNotes(s)) return false;
  const t = (s || "").trim();
  if (!t) return false;
  if (t.startsWith("#") && t.includes("\n") && t.length >= 80) return true;
  if (t.length < 120) return false;
  if ((t.match(/^## /gm) || []).length >= 2) return true;
  if (t.includes("| ---") || t.includes("|---")) return true;
  return false;
}

export { looksLikeDocument };

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
    yield { type: "delta", phase: "text", text: hasTools ? split.notes : text };
    return;
  }
  if (shouldYieldAsText(text, hasTools) || (!hasTools && looksLikeDocument(text))) {
    if (text.trim()) yield { type: "delta", phase: "text", text };
  }
}

function hiddenRead(name: string, args: Record<string, unknown>): boolean {
  if (name !== "read_file") return false;
  const rec = resolvePath(String(args.path || ""));
  return rec.displayPath.startsWith("context/") ||
    ["AGENTS.md", "MEMORY.md", "USER.md", "memory/MEMORY.md", "memory/USER.md"].includes(rec.displayPath);
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
  focusFile?: string | null;
}): AsyncGenerator<PhaseEvent, LoopOutput, undefined> {
  const { session, promptCtx, modelConfig, runtime, onSaveState, focusFile } = opts;
  for (const p of promptCtx.contextPaths || []) markObserved(session, p);
  markObserved(session, "memory/USER.md");
  markObserved(session, "memory/MEMORY.md");

  let lastDispatch: Awaited<ReturnType<typeof dispatchTool>> | null = null;

  return yield* runEngineLoop({
    session,
    modelConfig,
    callLLM: runtime.callLLM,
    onSaveState,
    host: {
      toolDefs: TOOL_DEFS,
      maxRounds: 20,
      buildMessages: (s) => [
        { role: "system", content: buildSystemPrompt(promptCtx, s, focusFile) },
        ...deriveMessages(s),
      ],
      shouldYieldModelEvent: (ev) => !(ev.type === "delta" && ev.phase === "text"),
      afterAssistant: async function* ({ result, hasTools }) {
        if (result.textContent) yield* emitUserVisible(result.textContent, hasTools);
      },
      checkPolicy: async (name, args, s) => {
        let exists = false;
        if (name === "write_file" || name === "edit_file") {
          const rec = await runtime.fs.stat(String(args.path || ""));
          exists = rec.exists;
        }
        return checkPolicy(name, args, s, exists, {
          focusFile,
          memoryIndex: promptCtx.memoryIndex,
        });
      },
      executeTool: async (name, args, s) => {
        lastDispatch = await dispatchTool(name, args, runtime.fs, s);
        return { result: lastDispatch.result, stop: lastDispatch.stop };
      },
      afterTool: async function* ({ name, args, denied }) {
        const processEv = hiddenRead(name, args) ? null : toolProcessEvent(name, args);
        if (processEv && processEv.type === "phase") {
          yield {
            type: "phase",
            phase: processEv.phase,
            meta: { ...(processEv.meta || {}), ...(denied ? { error: denied } : {}) },
          };
        }

        if (denied) {
          if (name === "write_file" && args.content) {
            const rawPath = String(args.path || "").trim();
            const split = splitMetaNotes(String(args.content));
            if (split.notes) yield { type: "delta", phase: "text", text: split.notes };
            if (split.document) {
              if (!rawPath) {
                yield { type: "delta", phase: "text", text: split.document };
              } else {
                yield* yieldWrite(split.document, {
                  path: resolvePath(rawPath).displayPath,
                  mode: "create",
                  preview: true,
                  error: denied,
                });
              }
            }
          }
          return;
        }

        const full = lastDispatch;
        if (!full) return;

        if (!processEv && full.phase !== "text") {
          const showRead = full.phase !== "read" || !!full.meta;
          if (showRead) yield { type: "phase", phase: full.phase as PhaseName, meta: full.meta };
        }
        if (full.writeContent && full.meta) yield* yieldWrite(full.writeContent, full.meta);
        if (full.notes) yield { type: "delta", phase: "text", text: full.notes };
        if (full.stop) yield { type: "delta", phase: "text", text: full.result };
      },
    },
  });
}
