export type { PhaseEvent, PhaseName, EngineInput } from "./phases";
export type {
  FileEntry,
  FileKind,
  FileRecord,
  FileStore,
  LogEvent,
  SavedState,
  Session,
} from "../engine/types";

export interface PromptContext {
  agentsMd: string;
  context: string[];
  contextPaths: string[];
  skillCatalog: Array<{ name: string; description: string }>;
  memoryIndex: Array<{ path: string; summary: string }>;
  userMd: string;
  memoryMd: string;
}
