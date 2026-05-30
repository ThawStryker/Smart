/**
 * useFiles — Workspace file CRUD with server-confirmed state.
 *
 * Rules:
 * - Never manipulate local state directly — always reload from server after mutation.
 * - Server is the source of truth. This prevents "file reappears" bugs.
 */
import { useState, useCallback } from "react";

export interface FileEntry {
  id: number;
  path: string;
  content: string;
  isFolder: number;
}

export function useFiles(sessionId: number) {
  const [files, setFiles] = useState<FileEntry[]>([]);

  const encodePath = (p: string) => p.split("/").map(encodeURIComponent).join("/");

  const resolveApi = (treePath: string) => {
    const agentMatch = treePath.match(/^agents\/([^/]+)\/(.+)$/);
    if (agentMatch)
      return { url: `/api/agents/${encodeURIComponent(agentMatch[1])}/files/${encodePath(agentMatch[2])}`, method: "PUT" };
    if (treePath.startsWith("workspace/"))
      return { url: `/api/work/workspace/${encodePath(treePath.slice("workspace/".length))}`, method: "PUT" };
    return { url: `/api/work/sessions/${sessionId}/files/${encodePath(treePath)}`, method: "PUT" };
  };

  const delUrl = (treePath: string) => {
    const m = treePath.match(/^agents\/([^/]+)\/(.+)$/);
    if (m) return `/api/agents/${encodeURIComponent(m[1])}/files/${encodePath(m[2])}`;
    if (treePath.startsWith("workspace/")) return `/api/work/workspace/${encodePath(treePath.slice("workspace/".length))}`;
    return `/api/work/sessions/${sessionId}/files/${encodePath(treePath)}`;
  };

  const load = useCallback(async () => {
    const [sessionRes, workspaceRes, agentRes] = await Promise.all([
      fetch(`/api/work/sessions/${sessionId}/files`),
      fetch("/api/work/workspace"),
      fetch("/api/agents"),
    ]);
    const all: FileEntry[] = [];
    if (sessionRes.ok) {
      const sf = await sessionRes.json();
      all.push(...sf.filter((f: FileEntry) => !f.path.startsWith("workspace/") && !f.path.startsWith("agents/")));
    }
    if (workspaceRes.ok) {
      const ws = await workspaceRes.json();
      for (const f of ws) all.push({ ...f, path: `workspace/${f.path}` });
    }
    if (agentRes.ok) {
      const agents = await agentRes.json();
      const results = await Promise.all(
        agents.map(async (a: { name: string }) => {
          const r = await fetch(`/api/agents/${a.name}/files`);
          if (!r.ok) return [];
          const fl = await r.json();
          return fl.map((f: FileEntry) => ({ ...f, path: `agents/${a.name}/${f.path}` }));
        }),
      );
      for (const af of results) all.push(...af);
    }
    const seen = new Set<string>();
    setFiles(all.filter((f) => { if (seen.has(f.path)) return false; seen.add(f.path); return true; }));
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
      alert(`Delete failed: ${filePath}`);
    }
  }, [load]);

  const rename = useCallback(async (filePath: string, newName: string) => {
    if (!newName.trim()) return;
    const parts = filePath.split("/");
    parts[parts.length - 1] = newName.trim();
    const newPath = parts.join("/");
    if (newPath === filePath) return;
    if (files.some((f) => f.path === newPath)) { alert(`"${newName}" already exists`); return; }

    const entry = files.find((f) => f.path === filePath);
    const content = entry?.content || "";
    const isFolder = !!entry?.isFolder;

    try {
      const newApi = resolveApi(newPath);
      if (newApi) {
        const r = await fetch(newApi.url, { method: newApi.method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content, isFolder: isFolder || undefined }) });
        if (!r.ok) throw new Error("Create failed");
      }
      await fetch(delUrl(filePath), { method: "DELETE" });
      await load();
    } catch {
      load();
    }
  }, [files, load]);

  return { files, load, create, createFolder, remove, rename };
}
