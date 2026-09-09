import type { PhaseEvent, PhaseName, EngineInput } from "./phases";
export type { PhaseEvent, PhaseName, EngineInput };

export type LogEvent =
  | { type: "user"; text: string }
  | { type: "assistant"; text: string; toolCalls?: Array<{ id: string; name: string; args: string }> }
  | { type: "tool"; id: string; name: string; content: string }
  | { type: "skill"; name: string; content: string };

/** 跨轮持久化：session log 是唯一真相 */
export interface SavedState {
  events: LogEvent[];
  observed: string[];
  loadedSkills: Record<string, string>;
  waitingForUser: boolean;
}

export interface Session {
  events: LogEvent[];
  observed: Set<string>;
  loadedSkills: Record<string, string>;
  waitingForUser: boolean;
}

export interface PromptContext {
  agentsMd: string;
  context: string[];
  skillCatalog: Array<{ name: string; description: string }>;
  memoryIndex: Array<{ path: string; summary: string }>;
  userMd: string;
  memoryMd: string;
}

export type FileKind = "workspace" | "agent";

export interface FileRecord {
  exists: boolean;
  content: string;
  kind: FileKind;
  storePath: string;
  displayPath: string;
}

export interface FileEntry {
  displayPath: string;
  isFolder: boolean;
  content: string | null;
}

export interface FileStore {
  stat(path: string): Promise<FileRecord>;
  read(path: string): Promise<FileRecord>;
  write(path: string, content: string): Promise<{ created: boolean }>;
  list(prefix: string): Promise<FileEntry[]>;
}
