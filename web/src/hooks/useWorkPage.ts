import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useSessions, useAgents, useFiles, useActiveFile } from "@/hooks";

export function useWorkPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const sessionId = parseInt(searchParams.get("session") || "0");
  const { sessions, loading, load: loadSessions, create: createSession, rename: renameSession, remove: deleteSession } = useSessions();
  const { agents, load: loadAgents } = useAgents();
  const { load: loadFiles } = useFiles(sessionId);
  const { activeFile, isStreaming, setIsStreaming, open: openFile, close: closeFile, updateContent, appendContent, save } = useActiveFile();
  const [reloadCounter, setReloadCounter] = useState(0);
  const [loadingTimeout, setLoadingTimeout] = useState(false);

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

  const handleCreateSession = async () => { const s = await createSession(); if (s) setSearchParams({ session: String(s.id) }); };
  const handleRetry = () => { setLoadingTimeout(false); loadSessions(); };

  return {
    sessionId, sessions, agents, loading, loadingTimeout,
    activeFile, isStreaming, setIsStreaming,
    openFile, closeFile, updateContent, appendContent, save,
    reloadCounter, setReloadCounter,
    handleCreateSession, handleRetry,
    renameSession, deleteSession, createSession,
    setSearchParams,
  };
}
