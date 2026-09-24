/** 通用瘦引擎。提示词、工具表、政策、存储由各页服务层注入。 */
export type { FileEntry, FileKind, FileRecord, FileStore, LogEvent, SavedState, Session } from "./types";
export type { PhaseEvent, PhaseName } from "./events";
export {
  compactIfNeeded,
  createSession,
  deriveMessages,
  emptySession,
  isObserved,
  markObserved,
  toSavedState,
} from "./session";
export { callLLM } from "./llm";
export type { CallLLM, LLMConfig, LLMResult } from "./llm";
export { runEngineLoop } from "./loop";
export type { AfterToolCtx, EngineHost, EngineToolResult, LoopOutput } from "./loop";
