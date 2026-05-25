import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { AgentPanel } from "@/components/work/AgentPanel";
import { DocumentEditor } from "@/components/work/DocumentEditor";
import { ChatPanel } from "@/components/work/ChatPanel";

interface WorkSession {
  id: number;
  title: string;
  summary: string;
}

export function WorkPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const sessionId = parseInt(searchParams.get("session") || "0");
  const [sessions, setSessions] = useState<WorkSession[]>([]);
  const [activeFile, setActiveFile] = useState<{ path: string; content: string } | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [agents, setAgents] = useState<string[]>([]);
  const [showNewSession, setShowNewSession] = useState(false);
  const [newSessionTitle, setNewSessionTitle] = useState("");

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
    if (!newSessionTitle.trim()) return;
    const res = await fetch("/api/work/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newSessionTitle.trim() }),
    });
    if (res.ok) {
      const s = await res.json();
      setNewSessionTitle(""); setShowNewSession(false);
      setSearchParams({ session: String(s.id) }); loadSessions();
    }
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
          <button onClick={() => setShowNewSession(true)}
            className="px-6 py-3 rounded-xl text-sm font-semibold transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 text-white"
            style={{ background: "linear-gradient(135deg, var(--app-accent), var(--app-accent-deep))", boxShadow: "0 4px 24px rgba(245,158,11,0.25)" }}>
            Create New Session
          </button>
          {showNewSession && <SessionModal title={newSessionTitle} setTitle={setNewSessionTitle} onCreate={createSession} onClose={() => setShowNewSession(false)} />}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[var(--app-bg)]">
      {/* Session bar */}
      <div className="flex items-center gap-3 px-3 py-2">
        <div className="flex items-center gap-3 px-3 h-9 rounded-xl bg-[var(--app-surface)] border border-[var(--app-border)]">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--app-text-secondary)" strokeWidth="2" strokeLinecap="round">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
          </svg>
          <select value={sessionId} onChange={(e) => { if (e.target.value) setSearchParams({ session: e.target.value }); }}
            className="bg-transparent text-sm font-medium cursor-pointer outline-none appearance-none pr-4 text-[var(--app-text)]">
            {sessions.map((s) => (
              <option key={s.id} value={s.id} style={{ background: "var(--app-surface)", color: "var(--app-text)" } as any}>{s.title}</option>
            ))}
          </select>
          <span className="text-[var(--app-border)]">|</span>
          <button onClick={() => setShowNewSession(true)} className="text-xs font-semibold transition-opacity hover:opacity-80 text-[var(--app-accent)]">+ New</button>
        </div>
        {agents.length > 0 && (
          <span className="text-xs px-2.5 py-1 rounded-lg font-medium bg-[var(--app-accent-bg)] border border-[var(--app-accent-border)] text-[var(--app-accent)]">
            {agents.length} agent{agents.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Panels */}
      <div className="flex flex-1 min-h-0">
        <div className="w-64 flex-shrink-0 overflow-hidden border-r border-[var(--app-border)]">
          <AgentPanel sessionId={sessionId} onFileSelect={handleFileSelect} selectedFile={activeFile?.path || null} onAgentListChange={loadAgents} />
        </div>
        <div className="flex-1 overflow-hidden">
          <DocumentEditor content={activeFile?.content || ""} filePath={activeFile?.path || null} isStreaming={isStreaming} onSave={handleSave}
            onContentChange={(content) => { if (activeFile) setActiveFile({ ...activeFile, content }); }} />
        </div>
        <div className="w-80 flex-shrink-0 overflow-hidden border-l border-[var(--app-border)]">
          <ChatPanel sessionId={sessionId} agents={agents} />
        </div>
      </div>

      {showNewSession && <SessionModal title={newSessionTitle} setTitle={setNewSessionTitle} onCreate={createSession} onClose={() => setShowNewSession(false)} />}
    </div>
  );
}

function SessionModal({ title, setTitle, onCreate, onClose }: {
  title: string; setTitle: (v: string) => void; onCreate: () => void; onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "var(--app-modal-backdrop)", backdropFilter: "blur(4px)" }}>
      <div className="rounded-2xl p-6 w-96 shadow-2xl bg-[var(--app-surface)] border border-[var(--app-border)] animate-pageIn">
        <h3 className="text-lg font-bold mb-4 tracking-tight text-[var(--app-text)]">New Session</h3>
        <input
          className="w-full rounded-xl px-4 py-3 text-sm outline-none transition-all duration-200 bg-[var(--app-bg)] border border-[var(--app-border)] text-[var(--app-text)]"
          placeholder="Session name..." value={title}
          onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && onCreate()} autoFocus />
        <div className="flex gap-2 justify-end mt-5">
          <button onClick={onClose} className="px-5 py-2.5 text-sm font-medium rounded-xl transition-colors hover:opacity-80 text-[var(--app-text-secondary)]">Cancel</button>
          <button onClick={onCreate}
            className="px-5 py-2.5 text-sm font-bold rounded-xl transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 text-white"
            style={{ background: "linear-gradient(135deg, var(--app-accent), var(--app-accent-deep))", boxShadow: "0 2px 16px rgba(245,158,11,0.2)" }}>
            Create
          </button>
        </div>
      </div>
    </div>
  );
}

export default WorkPage;
