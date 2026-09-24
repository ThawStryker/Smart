import { useState, useRef, useCallback } from "react";
import { blockFileSaves, getFileContent, isFileSaveBlocked, saveFileContent, unblockFileSaves } from "@/lib/file-api";

interface ActiveFile {
  path: string;
  content: string;
}

export function useActiveFile() {
  const [activeFile, setActiveFile] = useState<ActiveFile | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const savedContent = useRef<Record<string, string>>({});

  const open = useCallback((path: string, content: string, opts?: { bypassCache?: boolean }) => {
    if (opts?.bypassCache) {
      savedContent.current[path] = content;
      setActiveFile({ path, content });
      setIsStreaming(false);
      return;
    }
    const cached = savedContent.current[path];
    if (cached != null) {
      setActiveFile({ path, content: cached });
      setIsStreaming(false);
      return;
    }
    // 侧栏列表可能是打开页时的快照，先显示再拉服务端最新稿
    savedContent.current[path] = content;
    setActiveFile({ path, content });
    setIsStreaming(false);
    void getFileContent(path).then((fresh) => {
      if (fresh == null) return;
      if (savedContent.current[path] !== content) return;
      if (fresh === content) return;
      savedContent.current[path] = fresh;
      setActiveFile((prev) => (prev?.path === path ? { path, content: fresh } : prev));
    }).catch(() => { /* 用侧栏快照即可 */ });
  }, []);

  const openExisting = useCallback(async (path: string, _sessionId: number) => {
    try {
      const c = await getFileContent(path);
      savedContent.current[path] = c ?? "";
      setActiveFile({ path, content: c ?? "" });
    } catch {
      setActiveFile({ path, content: "" });
    }
    setIsStreaming(false);
  }, []);

  const close = useCallback(() => {
    setActiveFile((prev) => {
      // 正在删的文件不要把预览内容留在缓存里，否则侧栏会看起来像没删掉
      if (prev && isFileSaveBlocked(prev.path)) delete savedContent.current[prev.path];
      return null;
    });
    setIsStreaming(false);
  }, []);

  const updateContent = useCallback((content: string, path?: string) => {
    if (path) {
      if (isFileSaveBlocked(path)) delete savedContent.current[path];
      else savedContent.current[path] = content;
    }
    setActiveFile((prev) => {
      if (!prev) return null;
      // 旧编辑器卸载时会带回写，路径对不上就不要污染刚打开的文件
      if (path && prev.path !== path) return prev;
      if (isFileSaveBlocked(prev.path)) {
        delete savedContent.current[prev.path];
        return null;
      }
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
    // 挡住旧路径的卸载 flush，否则会把原文件再写回来，看起来像多出一份
    blockFileSaves(oldPath);
    const content = savedContent.current[oldPath] || activeFile?.content || "";
    delete savedContent.current[oldPath];
    savedContent.current[newPath] = content;
    setActiveFile((prev) => prev && prev.path === oldPath ? { path: newPath, content } : prev);
    window.setTimeout(() => unblockFileSaves(oldPath), 800);
  }, [activeFile]);

  const save = useCallback(async (path: string, content: string, _sessionId: number) => {
    if (isFileSaveBlocked(path)) {
      delete savedContent.current[path];
      return;
    }
    savedContent.current[path] = content;
    await saveFileContent(path, content);
  }, []);

  return { activeFile, isStreaming, setIsStreaming, open, openExisting, close, updateContent, appendContent, rename, save };
}
