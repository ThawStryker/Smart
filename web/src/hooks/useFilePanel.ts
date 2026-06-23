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
      const seen = new Set<string>();
      setFiles(allFiles.filter((f) => {
        if (seen.has(f.path)) return false;
        seen.add(f.path);
        return true;
      }));
    } catch {
      // Network error — keep existing file list unchanged
    }
  }, [urlPrefix, sessionId]);

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
