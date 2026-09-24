/** 瘦引擎的会话与文件系统契约。页面专属语义放在各服务层。 */

export type LogEvent =
  | { type: "user"; text: string }
  | { type: "assistant"; text: string; toolCalls?: Array<{ id: string; name: string; args: string }> }
  | { type: "tool"; id: string; name: string; content: string }
  | { type: "skill"; name: string; content: string };

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

export type FileKind = string;

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
