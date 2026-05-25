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
  const [editingTitle, setEditingTitle] = useState<string | null>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);

  const loadSessions = useCallback(async () => {
    const res = await fetch("/api/work/sessions");
    if (res.ok) {
      const data = await res.json();
      setSessions(data);
      if (!sessionId && data.length > 0) setSearchParams({ session: String(data[0].id) });
    }
  }, [sessionId, setSearchParams]);

  useEffect(() => { loadSessions(); }, [loadSessions]);

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

  const handleFirstMessage = useCallback(async (message: string) => {
    if (!sessionId) return;
    const current = sessions.find((s) => s.id === sessionId);
    if (current?.title === "新对话") {
      await updateSessionTitle(sessionId, truncateTitle(message));
    }
  }, [sessionId, sessions]);

  const handleRename = async (id: number) => {
    if (editingTitle !== null && editingTitle.trim()) {
      await updateSessionTitle(id, editingTitle.trim());
    }
    setEditingTitle(null);
  };

  const handleFileSelect = (path: string, content: string) => {
    setActiveFile({ path, content }); setIsStreaming(false);
  };

  const handleSave = async (path: string, content: string) => {
    await fetch(`/api/work/sessions/${sessionId}/files/${path}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
  };

  if (!sessionId) {
    return (
      <div className="flex items-center justify-center h-full bg-[var(--app-bg)]">
        <div className="text-center animate-pageIn">
          <div className="w-20 h-20 rounded-2xl mx-auto mb-6 flex items-center justify-center border border-[var(--app-accent-border)]"
            style={{ background: "linear-gradient(135deg, var(--app-accent-bg), rgba(217,119,6,0.06))" }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--app-accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold mb-3 tracking-tight text-[var(--app-text)]">Start a Work Session</h2>
          <p className="mb-8 text-sm leading-relaxed max-w-sm text-[var(--app-text-tertiary)]">
            Create a session, define your agents, and let them collaborate on documents.
          </p>
          <button onClick={createSession}
            className="px-6 py-3 rounded-xl text-sm font-semibold transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 text-white"
            style={{ background: "linear-gradient(135deg, var(--app-accent), var(--app-accent-deep))", boxShadow: "0 4px 24px rgba(245,158,11,0.25)" }}>
            Create New Session
          </button>
        </div>
      </div>
    );
  }

  const currentTitle = sessions.find((s) => s.id === sessionId)?.title || "新对话";

  return (
    <div className="flex h-full bg-[var(--app-bg)]">
      {/* Left Panel */}
      <div className="w-64 flex-shrink-0 flex flex-col overflow-hidden border-r border-[var(--app-border)]">
        {/* Session selector */}
        <div className="px-3 py-2">
          <div className="flex items-center gap-2 px-3 h-8 rounded-xl bg-[var(--app-surface)] border border-[var(--app-border)] min-w-0">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--app-text-secondary)" strokeWidth="2" strokeLinecap="round" className="shrink-0">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
            </svg>
            {editingTitle !== null ? (
              <input ref={titleInputRef} value={editingTitle}
                onChange={(e) => setEditingTitle(e.target.value)}
                onBlur={() => handleRename(sessionId)}
                onKeyDown={(e) => { if (e.key === "Enter") handleRename(sessionId); if (e.key === "Escape") setEditingTitle(null); }}
                className="bg-transparent text-sm font-medium outline-none text-[var(--app-text)] min-w-0 flex-1"
                autoFocus />
            ) : (
              <span className="text-sm font-medium truncate text-[var(--app-text)] cursor-pointer hover:opacity-70"
                onDoubleClick={() => { setEditingTitle(currentTitle); setTimeout(() => titleInputRef.current?.select(), 0); }}>
                {currentTitle}
              </span>
            )}
            {agents.length > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-md font-bold bg-[var(--app-accent-bg)] text-[var(--app-accent)] shrink-0">
                {agents.length}
              </span>
            )}
            <span className="text-[var(--app-border)] shrink-0">|</span>
            <button onClick={createSession} className="text-xs font-semibold transition-opacity hover:opacity-80 text-[var(--app-accent)] shrink-0">+</button>
          </div>
        </div>
        <AgentPanel sessionId={sessionId} onFileSelect={handleFileSelect} selectedFile={activeFile?.path || null} onAgentListChange={loadAgents} />
      </div>

      {/* Center Panel */}
      <div className="flex-1 overflow-hidden">
        <DocumentEditor content={activeFile?.content || ""} filePath={activeFile?.path || null} isStreaming={isStreaming} onSave={handleSave}
          onContentChange={(content) => { if (activeFile) setActiveFile({ ...activeFile, content }); }} />
      </div>

      {/* Right Panel */}
      <div className="w-80 flex-shrink-0 overflow-hidden border-l border-[var(--app-border)]">
        <ChatPanel sessionId={sessionId} agents={agents} onFirstMessage={handleFirstMessage} />
      </div>
    </div>
  );
}

export default WorkPage;
