import type { FileKind, FileRecord, FileEntry, FileStore } from "../types";

const AGENT_PREFIXES = ["skills/", "memory/", "context/"];
const AGENT_ROOTS = new Set(["AGENTS.md", "MEMORY.md", "USER.md"]);

export function resolvePath(rawPath: string): { kind: FileKind; storePath: string; displayPath: string } {
  const raw = (rawPath || "").trim().replace(/^\/+/, "");
  if (raw.startsWith("workspace/")) {
    const storePath = raw.slice("workspace/".length);
    return { kind: "workspace", storePath, displayPath: `workspace/${storePath}` };
  }
  if (AGENT_ROOTS.has(raw) || AGENT_PREFIXES.some((p) => raw.startsWith(p))) {
    return { kind: "agent", storePath: raw, displayPath: raw };
  }
  // 写作任务默认落到工作区
  return { kind: "workspace", storePath: raw, displayPath: `workspace/${raw}` };
}

export function listTarget(prefix: string): { kind: FileKind; storePrefix: string } {
  const raw = (prefix || "").trim().replace(/^\/+/, "");
  if (!raw || raw === "workspace" || raw === "workspace/") {
    return { kind: "workspace", storePrefix: "" };
  }
  if (raw.startsWith("workspace/")) {
    return { kind: "workspace", storePrefix: raw.slice("workspace/".length) };
  }
  return { kind: "agent", storePrefix: raw };
}

export function formatFileList(files: FileEntry[]): string {
  if (files.length === 0) return "(empty)";
  return files
    .map((f) => {
      const label = f.isFolder ? "[dir]" : "[file]";
      const firstLine = !f.isFolder && f.content
        ? f.content.trim().split("\n")[0]?.replace(/^#+\s*/, "").slice(0, 60) || ""
        : "";
      const summary = firstLine ? ` | ${firstLine}` : "";
      return `${label} ${f.displayPath}${summary}`;
    })
    .join("\n");
}

/** 规范化 markdown 表格 Cell 内换行 */
export function normalizeTableCellBreaks(content: string): string {
  let result = content;
  result = result.replace(/\\{1,2}\n/g, "<br>");
  result = result.replace(/(?:\\\|){2,}/g, "<br>");
  return result;
}

function missing(path: string): FileRecord {
  const { kind, storePath, displayPath } = resolvePath(path);
  return { exists: false, content: "", kind, storePath, displayPath };
}

/** 测试用内存文件系统 */
export class MemoryFileStore implements FileStore {
  workspace = new Map<string, string>();
  agent = new Map<string, string>();

  private bucket(kind: FileKind) {
    return kind === "workspace" ? this.workspace : this.agent;
  }

  async stat(path: string): Promise<FileRecord> {
    const { kind, storePath, displayPath } = resolvePath(path);
    const content = this.bucket(kind).get(storePath);
    if (content === undefined) return missing(path);
    return { exists: true, content, kind, storePath, displayPath };
  }

  async read(path: string): Promise<FileRecord> {
    return this.stat(path);
  }

  async write(path: string, content: string): Promise<{ created: boolean }> {
    const { kind, storePath } = resolvePath(path);
    const bucket = this.bucket(kind);
    const created = !bucket.has(storePath);
    bucket.set(storePath, content);
    return { created };
  }

  async list(prefix: string): Promise<FileEntry[]> {
    const { kind, storePrefix } = listTarget(prefix);
    const bucket = this.bucket(kind);
    const out: FileEntry[] = [];
    for (const [storePath, content] of bucket) {
      if (storePrefix && !storePath.startsWith(storePrefix)) continue;
      const displayPath = kind === "workspace" ? `workspace/${storePath}` : storePath;
      out.push({ displayPath, isFolder: false, content });
    }
    return out;
  }
}
