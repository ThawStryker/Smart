/**
 * useActiveFile — Currently open file state
 */
import { useState, useRef, useCallback } from "react";

interface ActiveFile {
  path: string;
  content: string;
}

export function useActiveFile() {
  const [activeFile, setActiveFile] = useState<ActiveFile | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const savedContent = useRef<Record<string, string>>({});

  const open = useCallback((path: string, content: string) => {
    setActiveFile({ path, content: savedContent.current[path] ?? content });
    setIsStreaming(false);
  }, []);

  const openExisting = useCallback(async (path: string, sessionId: number) => {
    const apiPath = path.startsWith("workspace/") ? path.slice("workspace/".length) : path;
    const url = path.startsWith("workspace/")
      ? `/api/work/workspace/${apiPath.split("/").map(encodeURIComponent).join("/")}`
      : `/api/work/sessions/${sessionId}/files/${apiPath.split("/").map(encodeURIComponent).join("/")}`;
    try {
      const r = await fetch(url);
      if (r.ok) {
        const data = await r.json();
        const c = data.content || "";
        savedContent.current[path] = c;
        setActiveFile({ path, content: c });
      }
    } catch {
      setActiveFile({ path, content: "" });
    }
    setIsStreaming(false);
  }, []);

  const close = useCallback(() => {
    if (activeFile) delete savedContent.current[activeFile.path];
    setActiveFile(null);
    setIsStreaming(false);
  }, [activeFile]);

  const updateContent = useCallback((content: string) => {
    setActiveFile((prev) => {
      if (!prev) return null;
      savedContent.current[prev.path] = content;
      return { ...prev, content };
    });
  }, []);

  /**
   * 在活跃文件末尾追加内容（用于 SSE doc 事件流式写入）
   * 使用函数式 setState，不依赖闭包中的 activeFile，避免竞争条件
   */
  const appendContent = useCallback((delta: string) => {
    setActiveFile((prev) => {
      if (!prev) return null;
      const newContent = (prev.content || "") + delta;
      savedContent.current[prev.path] = newContent;
      return { ...prev, content: newContent };
    });
  }, []);

  const rename = useCallback((oldPath: string, newPath: string) => {
    const content = savedContent.current[oldPath] || activeFile?.content || "";
    delete savedContent.current[oldPath];
    savedContent.current[newPath] = content;
    setActiveFile((prev) => prev && prev.path === oldPath ? { path: newPath, content } : prev);
  }, [activeFile]);

  const save = useCallback(async (path: string, content: string, sessionId: number) => {
    let url: string;
    const m = path.match(/^agents\/([^/]+)\/(.+)$/);
    if (m) {
      url = `/api/agents/${encodeURIComponent(m[1])}/files/${m[2].split("/").map(encodeURIComponent).join("/")}`;
    } else if (path.startsWith("workspace/")) {
      url = `/api/work/workspace/${path.slice("workspace/".length).split("/").map(encodeURIComponent).join("/")}`;
    } else {
      url = `/api/work/sessions/${sessionId}/files/${path.split("/").map(encodeURIComponent).join("/")}`;
    }
    savedContent.current[path] = content;
    await fetch(url, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content }) });
  }, []);

  return { activeFile, isStreaming, setIsStreaming, open, openExisting, close, updateContent, appendContent, rename, save };
}
