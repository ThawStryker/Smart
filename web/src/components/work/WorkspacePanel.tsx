import { useState, useEffect, useCallback, useRef } from "react";
import { buildTree, renderFileChildren } from "./FileTree";
import { WorkspaceActions } from "./ContextMenu";
import { useConfirm } from "@/components/shared/useConfirm";
import { resolveApiUrl, resolveDeleteUrl, resolveRenameUrl } from "@/lib/file-api";
import type { FileEntry } from "@/types/work";

interface WorkspacePanelProps {
  sessionId: number;
  onFileSelect: (path: string, content: string) => void;
  selectedFile: string | null;
  reloadTrigger?: number;
  onCloseFile?: () => void;
}

export function WorkspacePanel({ sessionId, onFileSelect, selectedFile, reloadTrigger, onCloseFile }: WorkspacePanelProps) {
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set(["workspace"]));
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const { confirm, ConfirmDialog } = useConfirm();
  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(null), 3000); return () => clearTimeout(t); } }, [toast]);
  const pendingDeletesRef = useRef<Set<string>>(new Set());

  const startFileRename = (path: string, name: string) => { setRenamingPath(path); setRenameValue(name); };
  const finishFileRename = (path: string, oldName: string) => {
    if (renameValue.trim() && renameValue.trim() !== oldName) {
      if (path.includes(`/${oldName}`)) {
        const tree = buildTree(files);
        const isFolder = (() => {
          const parts = path.split("/");
          let node: any = tree;
          for (const p of parts) { if (!node?.__kids?.[p]) return false; node = node.__kids[p]; }
          return node && typeof node === "object" && "__kids" in node;
        })();
        if (isFolder) renameFolder(path, renameValue.trim());
        else renameFile(path, renameValue.trim());
      }
    }
    setRenamingPath(null);
    setRenameValue("");
  };

  const loadFiles = useCallback(async () => {
    try {
      const res = await fetch("/api/work/workspace").catch(() => ({ ok: false } as Response));
      if (res.ok) {
        const wsFiles = await res.json();
        const allFiles: FileEntry[] = wsFiles.map((f: FileEntry) => ({ ...f, path: `workspace/${f.path}` }));
        const deletedFiles: string[] = JSON.parse(localStorage.getItem("deletedFiles") || "[]");
        const seen = new Set<string>();
        setFiles(allFiles.filter((f: FileEntry) => {
          if (deletedFiles.includes(f.path)) return false;
          if (pendingDeletesRef.current.has(f.path)) return false;
          if (seen.has(f.path)) return false;
          seen.add(f.path);
          return true;
        }));
      }
    } catch {
      // 网络错误 — 保持现有文件列表不变
    }
  }, []);

  useEffect(() => { if (sessionId) loadFiles(); }, [sessionId, loadFiles]);
  useEffect(() => { if (reloadTrigger && sessionId) loadFiles(); }, [reloadTrigger]);

  useEffect(() => {
    const handler = (e: StorageEvent) => { if (e.key === "deletedFiles") loadFiles(); };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, [loadFiles]);

  const toggleExpand = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path); else next.add(path);
      return next;
    });
  };

  const resolveApi = (treePath: string) => resolveApiUrl(treePath, sessionId);
  const resolveApiDelete = (treePath: string) => resolveDeleteUrl(treePath, sessionId);

  const createFile = useCallback(async (parentPath: string) => {
    const prefix = parentPath.endsWith("/") ? parentPath : `${parentPath}/`;
    const name = `新文件.md`;
    let path = `${prefix}${name}`;
    let idx = 1;
    while (files.some((f) => f.path === path)) { idx++; path = `${prefix}新文件 ${idx}.md`; }
    const api = resolveApi(path);
    if (api) await fetch(api.url, { method: api.method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: "" }) });
    loadFiles();
  }, [sessionId, files, loadFiles]);

  const createFolder = useCallback(async (parentPath: string) => {
    const prefix = parentPath.endsWith("/") ? parentPath : `${parentPath}/`;
    const name = "新文件夹";
    let path = `${prefix}${name}`;
    let idx = 1;
    while (files.some((f) => f.path === path)) { idx++; path = `${prefix}新文件夹 ${idx}`; }
    const api = resolveApi(path);
    if (api) await fetch(api.url, { method: api.method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isFolder: true }) });
    loadFiles();
  }, [sessionId, files, loadFiles]);

  const renameFolder = useCallback(async (folderPath: string, newName: string) => {
    if (!newName.trim()) return;
    const parentPath = folderPath.split("/").slice(0, -1).join("/");
    const newPath = parentPath ? `${parentPath}/${newName.trim()}` : newName.trim();
    if (newPath === folderPath) return;
    const renameUrl = resolveRenameUrl(folderPath, sessionId);
    if (!renameUrl) { loadFiles(); return; }
    try {
      const res = await fetch(renameUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oldPath: folderPath, newPath }),
      });
      if (!res.ok) throw new Error(`Rename failed: ${res.status}`);
    } catch { /* fallback */ }
    loadFiles();
  }, [files, sessionId, loadFiles]);

  const deleteFolder = useCallback(async (folderPath: string) => {
    if (!await confirm(`确定删除「${folderPath}」及其所有内容？`)) return;
    pendingDeletesRef.current.add(folderPath);
    setFiles((prev) => prev.filter((f) => f.path !== folderPath && !f.path.startsWith(`${folderPath}/`)));
    try {
      const url = resolveApiDelete(folderPath);
      if (!url) return;
      const res = await fetch(url, { method: "DELETE" });
      if (!res.ok) throw new Error(`Delete failed: ${res.status}`);
    } catch { loadFiles(); }
    pendingDeletesRef.current.delete(folderPath);
  }, [loadFiles]);

  const renameFile = useCallback(async (filePath: string, newName: string) => {
    if (!newName.trim()) return;
    const parentPath = filePath.split("/").slice(0, -1).join("/");
    const newPath = parentPath ? `${parentPath}/${newName.trim()}` : newName.trim();
    if (newPath === filePath) return;
    const renameUrl = resolveRenameUrl(filePath, sessionId);
    if (!renameUrl) { loadFiles(); return; }
    try {
      const res = await fetch(renameUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oldPath: filePath, newPath }),
      });
      if (!res.ok) throw new Error(`Rename failed: ${res.status}`);
    } catch { /* fallback */ }
    loadFiles();
  }, [sessionId, loadFiles]);

  const deleteFile = useCallback(async (filePath: string) => {
    if (!await confirm(`确定删除「${filePath}」？`)) return;
    try {
      const url = resolveApiDelete(filePath);
      if (!url) return;
      const res = await fetch(url, { method: "DELETE" });
      if (!res.ok) throw new Error(`Delete failed: ${res.status}`);
      if (selectedFile === filePath && onCloseFile) onCloseFile();
      const deletedFiles: string[] = JSON.parse(localStorage.getItem("deletedFiles") || "[]");
      deletedFiles.push(filePath);
      localStorage.setItem("deletedFiles", JSON.stringify(deletedFiles));
      setFiles((prev) => prev.filter((f) => f.path !== filePath));
    } catch {
      setToast(`删除失败：${filePath}`);
      loadFiles();
    }
  }, [selectedFile, onCloseFile, loadFiles]);

  const tree = buildTree(files);

  return (
    <div className="border-t border-[var(--app-border)] flex flex-col" style={{ flex: "1 1 0", minHeight: 0 }}>
      <div className="flex items-center justify-between px-4 py-2.5 group">
        <div className="flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--app-text-secondary)" strokeWidth="2" strokeLinecap="round" className="flex-shrink-0">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>
          <span className="text-xs font-bold uppercase tracking-widest text-[var(--app-text-tertiary)]">Workspace</span>
        </div>
        <WorkspaceActions onCreateFile={() => createFile("workspace")} onCreateFolder={() => createFolder("workspace")} />
      </div>
      <div className="flex-1 overflow-auto border-t border-[var(--app-border)]">
        {(() => {
          const children = renderFileChildren("workspace", tree, expanded, toggleExpand, onFileSelect, selectedFile, 0, createFile, createFolder, renameFolder, deleteFolder, renameFile, deleteFile, renamingPath, renameValue, startFileRename, setRenameValue, finishFileRename);
          if (children.length === 0) {
            return (
              <div className="px-4 py-6 text-center text-[10px] text-[var(--app-text-tertiary)] leading-relaxed">
                Workspace is empty.<br />Click <span className="text-[var(--app-accent)]">+</span> to add files or folders.
              </div>
            );
          }
          return children;
        })()}
      </div>

      {ConfirmDialog}

      {toast && (
        <div className="fixed bottom-20 right-4 z-50 animate-pageIn">
          <div className="rounded-xl px-4 py-2.5 text-xs font-medium text-center shadow-xl bg-[var(--app-surface)] border border-[var(--app-border)] text-[var(--app-text)]">
            {toast}
          </div>
        </div>
      )}
    </div>
  );
}

export default WorkspacePanel;
