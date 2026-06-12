import { useState, useCallback, useRef, useEffect } from "react";
import { useConfirm } from "@/components/shared/useConfirm";
import { resolveApiUrl, resolveDeleteUrl, resolveRenameUrl } from "@/lib/file-api";
import { buildTree } from "@/components/work/FileTree";
import type { FileEntry } from "@/types/work";
import type { ReactNode } from "react";

interface UseFileTreeActionsInput {
  sessionId: number;
  urlPrefix: "workspace" | "agents";
  files: FileEntry[];
  reloadFiles: () => void;
  selectedFile: string | null;
  onCloseFile?: () => void;
}

interface UseFileTreeActionsOutput {
  createFile: (parentPath: string) => Promise<void>;
  createFolder: (parentPath: string) => Promise<void>;
  renameFile: (filePath: string, newName: string) => Promise<void>;
  renameFolder: (folderPath: string, newName: string) => Promise<void>;
  deleteFile: (filePath: string) => Promise<void>;
  deleteFolder: (folderPath: string) => Promise<void>;
  startFileRename: (path: string, name: string) => void;
  finishFileRename: (path: string, oldName: string) => void;
  renamingPath: string | null;
  renameValue: string;
  setRenameValue: (value: string) => void;
  toast: string | null;
  setToast: (value: string | null) => void;
  confirm: (message: string) => Promise<boolean>;
  ConfirmDialog: ReactNode;
}

export function useFileTreeActions({
  sessionId,
  files,
  reloadFiles,
  selectedFile,
  onCloseFile,
}: UseFileTreeActionsInput): UseFileTreeActionsOutput {
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const { confirm, ConfirmDialog } = useConfirm();
  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(null), 3000); return () => clearTimeout(t); } }, [toast]);
  const pendingDeletesRef = useRef<Set<string>>(new Set());

  const resolveApi = (treePath: string) => resolveApiUrl(treePath, sessionId);
  const resolveApiDelete = (treePath: string) => resolveDeleteUrl(treePath, sessionId);

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

  const createFile = useCallback(async (parentPath: string) => {
    const prefix = parentPath.endsWith("/") ? parentPath : `${parentPath}/`;
    const name = `新文件.md`;
    let path = `${prefix}${name}`;
    let idx = 1;
    while (files.some((f) => f.path === path)) { idx++; path = `${prefix}新文件 ${idx}.md`; }
    const api = resolveApi(path);
    if (api) await fetch(api.url, { method: api.method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: "" }) });
    reloadFiles();
  }, [sessionId, files, reloadFiles]);

  const createFolder = useCallback(async (parentPath: string) => {
    const prefix = parentPath.endsWith("/") ? parentPath : `${parentPath}/`;
    const name = "新文件夹";
    let path = `${prefix}${name}`;
    let idx = 1;
    while (files.some((f) => f.path === path)) { idx++; path = `${prefix}新文件夹 ${idx}`; }
    const api = resolveApi(path);
    if (api) await fetch(api.url, { method: api.method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isFolder: true }) });
    reloadFiles();
  }, [sessionId, files, reloadFiles]);

  const renameFolder = useCallback(async (folderPath: string, newName: string) => {
    if (!newName.trim()) return;
    const parentPath = folderPath.split("/").slice(0, -1).join("/");
    const newPath = parentPath ? `${parentPath}/${newName.trim()}` : newName.trim();
    if (newPath === folderPath) return;
    const renameUrl = resolveRenameUrl(folderPath, sessionId);
    if (!renameUrl) { reloadFiles(); return; }
    const agentMatch = folderPath.match(/^agents\/([^/]+)\/(.+)$/);
    const serverOldPath = agentMatch ? agentMatch[2] : folderPath.replace(/^workspace\//, "");
    const serverNewPath = agentMatch
      ? agentMatch[2].replace(/\/?[^/]+$/, `/${newName.trim()}`)
      : newPath.replace(/^workspace\//, "");
    try {
      const res = await fetch(renameUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oldPath: serverOldPath, newPath: serverNewPath }),
      });
      if (!res.ok) throw new Error(`Rename failed: ${res.status}`);
    } catch { /* fallback */ }
    reloadFiles();
  }, [files, sessionId, reloadFiles]);

  const deleteFolder = useCallback(async (folderPath: string) => {
    if (!await confirm(`确定删除「${folderPath}」及其所有内容？`)) return;
    pendingDeletesRef.current.add(folderPath);
    try {
      const res = await fetch(resolveApiDelete(folderPath), { method: "DELETE" });
      if (!res.ok) throw new Error(`Delete failed: ${res.status}`);
    } catch { /* will reload on error */ }
    pendingDeletesRef.current.delete(folderPath);
    reloadFiles();
  }, [reloadFiles]);

  const renameFile = useCallback(async (filePath: string, newName: string) => {
    if (!newName.trim()) return;
    const parentPath = filePath.split("/").slice(0, -1).join("/");
    const newPath = parentPath ? `${parentPath}/${newName.trim()}` : newName.trim();
    if (newPath === filePath) return;
    const renameUrl = resolveRenameUrl(filePath, sessionId);
    if (!renameUrl) { reloadFiles(); return; }
    const agentMatch = filePath.match(/^agents\/([^/]+)\/(.+)$/);
    const serverOldPath = agentMatch ? agentMatch[2] : filePath.replace(/^workspace\//, "");
    const serverNewPath = agentMatch
      ? agentMatch[2].replace(/\/?[^/]+$/, `/${newName.trim()}`)
      : newPath.replace(/^workspace\//, "");
    try {
      const res = await fetch(renameUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oldPath: serverOldPath, newPath: serverNewPath }),
      });
      if (!res.ok) throw new Error(`Rename failed: ${res.status}`);
    } catch { /* fallback */ }
    reloadFiles();
  }, [sessionId, reloadFiles]);

  const deleteFile = useCallback(async (filePath: string) => {
    if (!await confirm(`确定删除「${filePath}」？`)) return;
    try {
      const res = await fetch(resolveApiDelete(filePath), { method: "DELETE" });
      if (!res.ok) throw new Error(`Delete failed: ${res.status}`);
      if (selectedFile === filePath && onCloseFile) onCloseFile();
      const deletedFiles: string[] = JSON.parse(localStorage.getItem("deletedFiles") || "[]");
      deletedFiles.push(filePath);
      localStorage.setItem("deletedFiles", JSON.stringify(deletedFiles));
      reloadFiles();
    } catch {
      setToast(`删除失败：${filePath}`);
      reloadFiles();
    }
  }, [selectedFile, onCloseFile, reloadFiles]);

  return {
    createFile,
    createFolder,
    renameFile,
    renameFolder,
    deleteFile,
    deleteFolder,
    startFileRename,
    finishFileRename,
    renamingPath,
    renameValue,
    setRenameValue,
    toast,
    setToast,
    confirm,
    ConfirmDialog,
  };
}
