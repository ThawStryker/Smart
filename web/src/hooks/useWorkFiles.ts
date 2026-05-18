import { useState, useEffect, useCallback } from "react";

interface WorkFile {
  path: string;
  content: string;
  isFolder: boolean;
  updatedAt: string;
}

export function useWorkFiles() {
  const [files, setFiles] = useState<WorkFile[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchFiles = useCallback(async (prefix = "") => {
    setLoading(true);
    const r = await fetch(`/api/work/files?prefix=${encodeURIComponent(prefix)}`, { credentials: "include" });
    if (r.ok) {
      const data = await r.json();
      if (Array.isArray(data)) setFiles(data);
    }
    setLoading(false);
  }, []);

  const readFile = useCallback(async (path: string): Promise<string | null> => {
    const r = await fetch(`/api/work/files/${encodeURIComponent(path)}`, { credentials: "include" });
    if (!r.ok) return null;
    const data = await r.json();
    return data.content;
  }, []);

  const writeFile = useCallback(async (path: string, content: string, isFolder = false) => {
    await fetch(`/api/work/files/${encodeURIComponent(path)}`, {
      method: "PUT", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, isFolder }),
    });
  }, []);

  const deleteFile = useCallback(async (path: string) => {
    await fetch(`/api/work/files/${encodeURIComponent(path)}`, {
      method: "DELETE", credentials: "include",
    });
  }, []);

  useEffect(() => { fetchFiles(); }, [fetchFiles]);

  return { files, loading, fetchFiles, readFile, writeFile, deleteFile };
}
