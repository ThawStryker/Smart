/**
 * useFiles — Workspace 文件 CRUD，服务器为唯一数据源。
 */
import { useState, useCallback } from "react";
import { resolveApiUrl, resolveDeleteUrl, resolveRenameUrl } from "@/lib/file-api";

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
      const res = await fetch("/api/work/workspace").catch(() => ({ ok: false } as Response));
      if (res.ok) {
        const wsFiles = await res.json();
        setFiles(wsFiles.map((f: FileEntry) => ({ ...f, path: `workspace/${f.path}` })));
      }
    } catch {
      // 网络错误 — 保持现有文件列表不变
    }
  }, []);

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
      const url = delUrl(filePath);
      if (!url) return;
      const res = await fetch(url, { method: "DELETE" });
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
      const url = renameUrl(filePath);
      if (!url) return;
      const res = await fetch(url, {
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
