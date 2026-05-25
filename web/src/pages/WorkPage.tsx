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
  const [showSessionList, setShowSessionList] = useState(false);

  return (
    <div className="flex h-full bg-[var(--app-bg)]">
      {/* Left Panel */}
      <div className="w-64 flex-shrink-0 flex flex-col overflow-hidden border-r border-[var(--app-border)]">
        {/* Session selector — fixed at top */}
        <div className="px-3 py-2.5 flex items-center gap-2">
          {/* Session dropdown */}
          <div className="relative flex-1 min-w-0">
            <button onClick={() => setShowSessionList(!showSessionList)}
              onDoubleClick={() => { setEditingTitle(currentTitle); setTimeout(() => titleInputRef.current?.select(), 0); }}
              className="flex items-center gap-1.5 w-full h-7 px-2.5 rounded-lg bg-[var(--app-surface)] border border-[var(--app-border)] text-sm font-medium text-[var(--app-text)] truncate hover:border-[var(--app-border-hover)] transition-colors"
              title="双击重命名">
              <span className="truncate flex-1 text-left">{currentTitle}</span>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--app-text-tertiary)" strokeWidth="2.5" strokeLinecap="round" className="shrink-0"
                style={{ transform: showSessionList ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}>
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            {showSessionList && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setShowSessionList(false)} />
                <div className="absolute top-full mt-1 left-0 right-0 z-40 rounded-xl bg-[var(--app-surface)] border border-[var(--app-border)] shadow-xl overflow-hidden"
                  style={{ maxHeight: "240px", overflowY: "auto" }}>
                  {sessions.map((s) => (
                    <div key={s.id}
                      className="px-3 py-2 text-sm cursor-pointer transition-colors hover:bg-[var(--app-accent-bg)] flex items-center justify-between group"
                      style={{ color: s.id === sessionId ? "var(--app-accent)" : "var(--app-text)" }}
                      onClick={() => { setSearchParams({ session: String(s.id) }); setShowSessionList(false); }}>
                      <span className="truncate">{s.title}</span>
                      <span className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 shrink-0 ml-2">
                        <button onClick={(e) => { e.stopPropagation(); setEditingTitle(s.title); setShowSessionList(false); }}
                          className="w-5 h-5 rounded-md flex items-center justify-center hover:bg-[var(--app-accent-bg)] transition-colors"
                          title="重命名">
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--app-text-secondary)" strokeWidth="2" strokeLinecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                        </button>
                        <button onClick={async (e) => {
                          e.stopPropagation();
                          if (!confirm("Delete this session?")) return;
                          await fetch(`/api/work/sessions/${s.id}`, { method: "DELETE" });
                          loadSessions();
                          if (s.id === sessionId) {
                            const remaining = sessions.filter((x) => x.id !== s.id);
                            if (remaining.length > 0) setSearchParams({ session: String(remaining[0].id) });
                            else setSearchParams({});
                          }
                        }}
                          className="w-5 h-5 rounded-md flex items-center justify-center hover:bg-[var(--app-red-bg)] transition-colors"
                          title="删除">
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--app-red)" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                        </button>
                      </span>
                    </div>
                  ))}
                  <div className="border-t border-[var(--app-border)]" />
                  <div onClick={() => { createSession(); setShowSessionList(false); }}
                    className="px-3 py-2 text-sm cursor-pointer transition-colors hover:bg-[var(--app-accent-bg)] text-[var(--app-accent)] font-medium flex items-center gap-2">
                    <span className="text-base leading-none">+</span> 新对话
                  </div>
                </div>
              </>
            )}
          </div>

          {/* + New session — subtle circle */}
          <button onClick={createSession}
            className="w-6 h-6 rounded-full flex items-center justify-center text-sm font-medium transition-all duration-200 hover:scale-110 shrink-0 border border-[var(--app-accent-border)] text-[var(--app-accent)] hover:bg-[var(--app-accent-bg)]"
            title="新对话">
            +
          </button>

          {/* Inline rename overlay */}
          {editingTitle !== null && (
            <div className="fixed inset-0 z-50" onClick={() => handleRename(sessionId)} />
          )}
        </div>

        {/* Inline rename input — appears below session bar when editing */}
        {editingTitle !== null && (
          <div className="px-3 pb-2">
            <input ref={titleInputRef} value={editingTitle}
              onChange={(e) => setEditingTitle(e.target.value)}
              onBlur={() => handleRename(sessionId)}
              onKeyDown={(e) => { if (e.key === "Enter") handleRename(sessionId); if (e.key === "Escape") setEditingTitle(null); }}
              className="w-full h-8 px-3 rounded-xl bg-[var(--app-surface)] border border-[var(--app-accent)] text-sm outline-none text-[var(--app-text)]"
              autoFocus />
          </div>
        )}
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
