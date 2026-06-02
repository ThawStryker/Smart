import { useState, useEffect, useCallback } from "react";
import { buildTree, renderFileChildren } from "./FileTree";
import { WorkspaceActions } from "./ContextMenu";
import { useFileTreeActions } from "@/hooks/useFileTreeActions";
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

  const {
    createFile, createFolder, renameFile, renameFolder, deleteFile, deleteFolder,
    startFileRename, finishFileRename, renamingPath, renameValue, setRenameValue,
    toast, ConfirmDialog,
  } = useFileTreeActions({ sessionId, urlPrefix: "workspace", files, reloadFiles: loadFiles, selectedFile, onCloseFile });

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
