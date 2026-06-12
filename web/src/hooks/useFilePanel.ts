import { useState, useEffect, useCallback } from "react";
import { buildTree } from "@/components/work/FileTree";
import { useFileTreeActions } from "@/hooks/useFileTreeActions";
import { loadAllAgentFiles, loadWorkspaceFiles } from "@/lib/file-api";
import type { FileEntry } from "@/types/work";


interface UseFilePanelInput {
  sessionId: number;
  urlPrefix: "workspace" | "agents";
  selectedFile: string | null;
  onCloseFile?: () => void;
  reloadTrigger?: number;
}

export function useFilePanel({ sessionId, urlPrefix, selectedFile, onCloseFile, reloadTrigger }: UseFilePanelInput) {
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set([urlPrefix]));

  const loadFiles = useCallback(async () => {
    try {
      let allFiles: FileEntry[] = [];
      if (urlPrefix === "agents") {
        const agentFileMap = await loadAllAgentFiles();
        for (const [agentName, agentFiles] of agentFileMap) {
          for (const f of agentFiles) {
            allFiles.push({ ...f, path: `agents/${agentName}/${f.path}` });
          }
        }
      } else {
        const wsFiles = await loadWorkspaceFiles();
        allFiles = wsFiles.map((f) => ({ ...f, path: `workspace/${f.path}` }));
      }
      const deletedFiles: string[] = JSON.parse(localStorage.getItem("deletedFiles") || "[]");
      const seen = new Set<string>();
      setFiles(allFiles.filter((f) => {
        if (deletedFiles.includes(f.path)) return false;
        if (seen.has(f.path)) return false;
        seen.add(f.path);
        return true;
      }));
    } catch {
      // Network error — keep existing file list unchanged
    }
  }, [urlPrefix, sessionId]);

  useEffect(() => {
    const handler = (e: StorageEvent) => { if (e.key === "deletedFiles") loadFiles(); };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, [loadFiles]);

  useEffect(() => { if (sessionId) loadFiles(); }, [sessionId, loadFiles]);
  useEffect(() => { if (reloadTrigger && sessionId) loadFiles(); }, [reloadTrigger]);

  const toggleExpand = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path); else next.add(path);
      return next;
    });
  };

  const tree = buildTree(files);

  const fileTreeActions = useFileTreeActions({ sessionId, urlPrefix, files, reloadFiles: loadFiles, selectedFile, onCloseFile });

  return {
    files,
    expanded,
    setExpanded,
    toggleExpand,
    tree,
    ...fileTreeActions,
  };
}
