/**
 * useFiles — Workspace file CRUD with server-confirmed state.
 *
 * Rules:
 * - Never manipulate local state directly — always reload from server after mutation.
 * - Server is the source of truth. This prevents "file reappears" bugs.
 */
import { useState, useCallback } from "react";
import { resolveApiUrl, resolveDeleteUrl, resolveRenameUrl, loadAllAgentFiles } from "@/lib/file-api";

export interface FileEntry {
  id: number;
  path: string;
  content: string;
  isFolder: number;
}

export function useFiles(sessionId: number) {
  const [files, setFiles] = useState<FileEntry[]>([]);

  const resolveApi = (treePath: string) => resolveApiUrl(treePath, sessionId);
  const delUrl = (treePath: string) => resolveDeleteUrl(treePath, sessionId);

  const load = useCallback(async () => {
    try {
      const [workspaceRes] = await Promise.all([
        fetch("/api/work/workspace").catch(() => ({ ok: false } as Response)),
      ]);
      const all: FileEntry[] = [];
      if (workspaceRes.ok) {
        const ws = await workspaceRes.json();
        for (const f of ws) all.push({ ...f, path: `workspace/${f.path}` });
      }
      // Agent files — 批量加载（N+1 → 1 请求）
      const agentFileMap = await loadAllAgentFiles();
      for (const [agentName, files] of agentFileMap) {
        for (const f of files) {
          all.push({ ...f, path: `agents/${agentName}/${f.path}` });
        }
      }
      const seen = new Set<string>();
      setFiles(all.filter((f) => { if (seen.has(f.path)) return false; seen.add(f.path); return true; }));
    } catch {
      // Network error — keep existing file list unchanged
    }
  }, [sessionId]);

  const create = useCallback(async (parentPath: string) => {
    const prefix = parentPath.endsWith("/") ? parentPath : `${parentPath}/`;
    let path = `${prefix}新文件.md`;
    let idx = 1;
    while (files.some((f) => f.path === path)) { idx++; path = `${prefix}新文件 ${idx}.md`; }
    const api = resolveApi(path);
    if (api) await fetch(api.url, { method: api.method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: "" }) });
    await load();
  }, [files, load]);

  const createFolder = useCallback(async (parentPath: string) => {
    const prefix = parentPath.endsWith("/") ? parentPath : `${parentPath}/`;
    let path = `${prefix}新文件夹`;
    let idx = 1;
    while (files.some((f) => f.path === path)) { idx++; path = `${prefix}新文件夹 ${idx}`; }
    const api = resolveApi(path);
    if (api) await fetch(api.url, { method: api.method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isFolder: true }) });
    await load();
  }, [files, load]);

  const remove = useCallback(async (filePath: string) => {
    try {
      const res = await fetch(delUrl(filePath), { method: "DELETE" });
      if (!res.ok) throw new Error(`Delete failed: ${res.status}`);
      await load();
    } catch {
      console.error(`Delete failed: ${filePath}`);
    }
  }, [load]);

  const renameUrl = (treePath: string) => resolveRenameUrl(treePath, sessionId) ?? "";

  const rename = useCallback(async (filePath: string, newName: string) => {
    if (!newName.trim()) return;
    const parts = filePath.split("/");
    parts[parts.length - 1] = newName.trim();
    const newPath = parts.join("/");
    if (newPath === filePath) return;
    try {
      const res = await fetch(renameUrl(filePath), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oldPath: filePath, newPath }),
      });
      if (!res.ok) throw new Error("Rename failed");
      await load();
    } catch {
      load();
    }
  }, [sessionId, load]);

  return { files, load, create, createFolder, remove, rename };
}
