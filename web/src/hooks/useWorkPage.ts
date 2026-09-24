import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { useSessions, useAgents, useFiles, useActiveFile } from "@/hooks";

export function useWorkPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const sessionId = parseInt(searchParams.get("session") || "0");
  const { sessions, loading, load: loadSessions, create: createSession, rename: renameSession, remove: deleteSession } = useSessions();
  const { agents, load: loadAgents } = useAgents();
  const { load: loadFiles } = useFiles(sessionId);
  const { activeFile, isStreaming, setIsStreaming, open: openFile, openExisting, close: closeFile, updateContent, appendContent, save, rename } = useActiveFile();
  const [reloadCounter, setReloadCounter] = useState(0);
  const [loadingTimeout, setLoadingTimeout] = useState(false);
  const [isCurrentEmpty, setIsCurrentEmpty] = useState(false);
  const creatingRef = useRef(false);

  useEffect(() => {
    if (!loading) { setLoadingTimeout(false); return; }
    const timer = setTimeout(() => setLoadingTimeout(true), 15000);
    return () => clearTimeout(timer);
  }, [loading]);

  useEffect(() => { loadSessions(); loadAgents(); }, [loadSessions, loadAgents]);

  useEffect(() => {
    if (loading) return;
    if (sessions.length === 0) return;
    const exists = sessions.some((s: any) => s.id === sessionId);
    if (!sessionId || !exists) setSearchParams({ session: String(sessions[0].id) });
  }, [loading, sessions, sessionId, setSearchParams]);

  useEffect(() => { if (sessionId) loadFiles(); }, [sessionId, loadFiles]);
  useEffect(() => { if (reloadCounter && sessionId) loadFiles(); }, [reloadCounter, sessionId, loadFiles]);

  const handleEmptyChange = useCallback((empty: boolean) => {
    setIsCurrentEmpty(empty);
  }, []);

  const handleCreateSession = async () => {
    // 当前就是空对话时不新建，避免堆出一串空白会话
    if (creatingRef.current) return;
    if (isCurrentEmpty && sessions.some((s) => s.id === sessionId)) return;
    creatingRef.current = true;
    try {
      const s = await createSession();
      if (s) {
        setIsCurrentEmpty(true);
        setSearchParams({ session: String(s.id) });
      }
    } finally {
      creatingRef.current = false;
    }
  };

  const handleSelectSession = async (id: number) => {
    if (id === sessionId) return;
    const leaving = sessionId;
    const discard = isCurrentEmpty && leaving > 0;
    setIsCurrentEmpty(false);
    setSearchParams({ session: String(id) });
    // 空对话切走即丢弃，不保留
    if (discard) await deleteSession(leaving);
  };

  const handleRetry = () => { setLoadingTimeout(false); loadSessions(); };

  return {
    sessionId, sessions, agents, loading, loadingTimeout,
    activeFile, isStreaming, setIsStreaming,
    openFile, openExisting, closeFile, updateContent, appendContent, save, rename,
    reloadCounter, setReloadCounter,
    isCurrentEmpty, handleEmptyChange, setIsCurrentEmpty,
    handleCreateSession, handleSelectSession, handleRetry,
    renameSession, deleteSession, createSession,
    setSearchParams, loadAgents,
  };
}
