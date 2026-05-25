import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { AgentPanel } from "@/components/work/AgentPanel";
import { DocumentEditor } from "@/components/work/DocumentEditor";
import { ChatPanel } from "@/components/work/ChatPanel";

interface WorkSession {
  id: number;
  title: string;
  summary: string;
}

function truncateTitle(text: string, max = 30): string {
  return text.length > max ? text.slice(0, max) + "..." : text;
}

export function WorkPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const sessionId = parseInt(searchParams.get("session") || "0");
  const [sessions, setSessions] = useState<WorkSession[]>([]);
  const [activeFile, setActiveFile] = useState<{ path: string; content: string } | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [agents, setAgents] = useState<string[]>([]);
  const [initializing, setInitializing] = useState(true);
  const initRan = useRef(false);

  const loadSessions = useCallback(async () => {
    const res = await fetch("/api/work/sessions");
    if (res.ok) {
      const data = await res.json();
      setSessions(data);
      if (data.length > 0) {
        const currentId = parseInt(searchParams.get("session") || "0");
        const exists = data.some((s: WorkSession) => s.id === currentId);
        if (!currentId || !exists) {
          setSearchParams({ session: String(data[0].id) });
        }
      }
      return data;
    }
    return [];
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (initRan.current) return;
    initRan.current = true;
    (async () => {
      let data = await loadSessions();
      if (data.length === 0) {
        const res = await fetch("/api/work/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "新对话" }),
        });
        if (res.ok) {
          const s = await res.json();
          setSearchParams({ session: String(s.id) });
          data = await loadSessions();
        }
      }
      setInitializing(false);
    })();
  }, []);

  const loadAgents = useCallback(async () => {
    if (!sessionId) return;
    const res = await fetch(`/api/work/sessions/${sessionId}/files?prefix=agents/`);
    if (res.ok) {
      const files: Array<{ path: string }> = await res.json();
      const names = new Set<string>();
      for (const f of files) {
        const match = f.path.match(/^agents\/([^/]+)\//);
        if (match) names.add(match[1]);
      }
      setAgents(Array.from(names));
    }
  }, [sessionId]);

  useEffect(() => { loadAgents(); }, [loadAgents]);

  const createSession = async () => {
    const res = await fetch("/api/work/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "新对话" }),
    });
    if (res.ok) {
      const s = await res.json();
      setSearchParams({ session: String(s.id) });
      loadSessions();
    }
  };

  const updateSessionTitle = async (id: number, title: string) => {
    await fetch(`/api/work/sessions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, title } : s)));
  };

  const deleteSession = async (id: number) => {
    await fetch(`/api/work/sessions/${id}`, { method: "DELETE" });
    loadSessions();
    if (id === sessionId) {
      const remaining = sessions.filter((x) => x.id !== id);
      if (remaining.length > 0) setSearchParams({ session: String(remaining[0].id) });
      else setSearchParams({});
    }
  };

  const handleFirstMessage = useCallback(async (message: string) => {
    if (!sessionId) return;
    const current = sessions.find((s) => s.id === sessionId);
    if (current?.title === "新对话") {
      await updateSessionTitle(sessionId, truncateTitle(message));
    }
  }, [sessionId, sessions]);

  const handleFileSelect = (path: string, content: string) => {
    setActiveFile({ path, content }); setIsStreaming(false);
  };

  const handleSave = async (path: string, content: string) => {
    await fetch(`/api/work/sessions/${sessionId}/files/${path}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
  };

  if (initializing || !sessionId) {
    return (
      <div className="flex items-center justify-center h-full bg-[var(--app-bg)]">
        <div className="flex items-center gap-2 text-sm text-[var(--app-text-tertiary)] animate-pulse">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--app-accent)]" />
          Loading...
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full bg-[var(--app-bg)]">
      {/* Left Panel */}
      <div className="w-64 flex-shrink-0 flex flex-col overflow-hidden border-r border-[var(--app-border)]">
        <AgentPanel sessionId={sessionId} onFileSelect={handleFileSelect} selectedFile={activeFile?.path || null} onAgentListChange={loadAgents} />
      </div>

      {/* Center Panel */}
      <div className="flex-1 overflow-hidden">
        <DocumentEditor content={activeFile?.content || ""} filePath={activeFile?.path || null} isStreaming={isStreaming} onSave={handleSave}
          onContentChange={(content) => { if (activeFile) setActiveFile({ ...activeFile, content }); }} />
      </div>

      {/* Right Panel */}
      <div className="w-80 flex-shrink-0 overflow-hidden border-l border-[var(--app-border)]">
        <ChatPanel
          sessionId={sessionId}
          agents={agents}
          sessions={sessions}
          onFirstMessage={handleFirstMessage}
          onCreateSession={createSession}
          onSelectSession={(id) => setSearchParams({ session: String(id) })}
          onRenameSession={updateSessionTitle}
          onDeleteSession={deleteSession}
        />
      </div>
    </div>
  );
}

export default WorkPage;
