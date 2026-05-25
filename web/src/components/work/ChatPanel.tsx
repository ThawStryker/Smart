import { useState, useRef, useEffect, useCallback } from "react";

interface ChatMessage {
  id: number;
  agentName: string | null;
  role: string;
  content: string;
  createdAt: string;
}

interface StreamingState {
  agentName: string | null;
  content: string;
  isActive: boolean;
}

interface WorkSession {
  id: number;
  title: string;
}

interface ChatPanelProps {
  sessionId: number;
  agents: string[];
  sessions: WorkSession[];
  onFirstMessage?: (message: string) => void;
  onCreateSession: () => void;
  onSelectSession: (id: number) => void;
  onRenameSession: (id: number, title: string) => void;
  onDeleteSession: (id: number) => void;
}

export function ChatPanel({
  sessionId, agents, sessions,
  onFirstMessage, onCreateSession, onSelectSession, onRenameSession, onDeleteSession,
}: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState<StreamingState>({
    agentName: null, content: "", isActive: false,
  });
  const [showMentions, setShowMentions] = useState(false);
  const [mentionFilter, setMentionFilter] = useState("");
  const [mentionIndex, setMentionIndex] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const loadMessages = useCallback(async () => {
    const res = await fetch(`/api/work/sessions/${sessionId}/messages`);
    if (res.ok) setMessages(await res.json());
  }, [sessionId]);

  useEffect(() => { if (sessionId) loadMessages(); }, [sessionId, loadMessages]);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, streaming.content]);

  const handleInput = (value: string) => {
    setInput(value);
    const cursorPos = inputRef.current?.selectionStart || value.length;
    const beforeCursor = value.slice(0, cursorPos);
    const atMatch = beforeCursor.match(/@(\S*)$/);
    if (atMatch) { setMentionFilter(atMatch[1]); setShowMentions(true); setMentionIndex(0); }
    else setShowMentions(false);
  };

  const insertMention = (agentName: string) => {
    const cursorPos = inputRef.current?.selectionStart || input.length;
    const beforeCursor = input.slice(0, cursorPos);
    const afterCursor = input.slice(cursorPos);
    const atMatch = beforeCursor.match(/@(\S*)$/);
    if (atMatch) setInput(beforeCursor.slice(0, beforeCursor.length - atMatch[0].length) + `@${agentName} ` + afterCursor);
    setShowMentions(false);
    inputRef.current?.focus();
  };

  const sendMessage = async () => {
    if (!input.trim() || streaming.isActive) return;
    const message = input.trim(); setInput("");

    // Auto-title on first message
    if (messages.length === 0 && onFirstMessage) {
      onFirstMessage(message);
    }

    setStreaming({ agentName: null, content: "", isActive: true });
    const controller = new AbortController(); abortRef.current = controller;
    try {
      const res = await fetch("/api/work/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, message }), signal: controller.signal,
      });
      if (!res.ok) { setStreaming((p) => ({ ...p, content: `Error: ${res.status}`, isActive: false })); return; }
      const reader = res.body?.getReader();
      if (!reader) { setStreaming({ agentName: null, content: "", isActive: false }); return; }
      const decoder = new TextDecoder(); let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n"); buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6));
            switch (event.type) {
              case "text": setStreaming((p) => ({ ...p, agentName: event.agentName || p.agentName, content: p.content + (event.delta || ""), isActive: true })); break;
              case "agent_start": setStreaming({ agentName: event.agentName, content: "", isActive: true }); break;
              case "tool_exec": setStreaming((p) => ({ ...p, content: p.content + `\n\n> ${event.toolName}` })); break;
              case "error": setStreaming((p) => ({ ...p, content: p.content + `\n\nError: ${event.message}` })); break;
            }
          } catch {}
        }
      }
    } catch (err: any) {
      if (err.name !== "AbortError") setStreaming((p) => ({ ...p, content: p.content + `\n\nError: ${err.message}` }));
    }
    setStreaming((p) => ({ ...p, isActive: false })); abortRef.current = null; loadMessages();
  };

  const stopStreaming = () => { abortRef.current?.abort(); setStreaming((p) => ({ ...p, isActive: false })); };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showMentions) {
      const filtered = agents.filter((a) => a.toLowerCase().startsWith(mentionFilter.toLowerCase()));
      if (e.key === "ArrowDown") { e.preventDefault(); setMentionIndex((i) => Math.min(i + 1, filtered.length - 1)); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setMentionIndex((i) => Math.max(i - 1, 0)); }
      else if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); if (filtered[mentionIndex]) insertMention(filtered[mentionIndex]); }
      else if (e.key === "Escape") setShowMentions(false);
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const filteredMentions = agents.filter((a) => a.toLowerCase().startsWith(mentionFilter.toLowerCase()));

  return (
    <div className="flex flex-col h-full bg-[var(--app-bg)]">
      {/* Header: session selector */}
      <SessionBar
        sessions={sessions}
        sessionId={sessionId}
        onCreateSession={onCreateSession}
        onSelectSession={onSelectSession}
        onRenameSession={onRenameSession}
        onDeleteSession={onDeleteSession}
      />

      <div className="flex-1 overflow-auto px-4 py-3 space-y-4">
        {messages.map((msg) => (
          <div key={msg.id} className="animate-pageIn">
            <div className="flex items-center gap-2 mb-1.5">
              {msg.role === "user" ? (
                <span className="text-xs font-bold uppercase tracking-wider text-[var(--app-accent)]">You</span>
              ) : (
                <>
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: msg.agentName ? "#a78bfa" : "var(--app-text-secondary)" }} />
                  <span className="text-xs font-bold uppercase tracking-wider" style={{ color: msg.agentName ? "#a78bfa" : "var(--app-text-secondary)" }}>
                    {msg.agentName || "Hermes"}
                  </span>
                </>
              )}
            </div>
            <div className="text-sm leading-relaxed whitespace-pre-wrap rounded-xl px-4 py-3 text-[var(--app-text)]"
              style={{ background: msg.role === "user" ? "rgba(255,255,255,0.04)" : "transparent", border: msg.role === "user" ? "1px solid var(--app-border)" : "none" }}>
              {msg.content}
            </div>
          </div>
        ))}
        {streaming.isActive && (
          <div className="animate-pageIn">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: streaming.agentName ? "#a78bfa" : "var(--app-accent)" }} />
              <span className="text-xs font-bold uppercase tracking-wider" style={{ color: streaming.agentName ? "#a78bfa" : "var(--app-accent)" }}>
                {streaming.agentName || "Hermes"}
              </span>
            </div>
            <div className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: streaming.content ? "var(--app-text)" : "var(--app-text-tertiary)" }}>
              {streaming.content || "Thinking..."}
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="border-t border-[var(--app-border)]">
        {showMentions && filteredMentions.length > 0 && (
          <div className="mx-3 mt-2 rounded-xl overflow-hidden shadow-lg bg-[var(--app-surface)] border border-[var(--app-border)]">
            {filteredMentions.map((agent, i) => (
              <div key={agent} className="px-3 py-2 text-sm cursor-pointer transition-colors flex items-center gap-2"
                style={{ background: i === mentionIndex ? "rgba(255,255,255,0.04)" : "transparent", color: i === mentionIndex ? "var(--app-accent)" : "var(--app-text-secondary)" }}
                onMouseDown={(e) => { e.preventDefault(); insertMention(agent); }}>
                <span className="text-xs font-mono font-bold text-[var(--app-accent)]">@</span>{agent}
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-2 p-3">
          <textarea ref={inputRef} value={input}
            onChange={(e) => handleInput(e.target.value)} onKeyDown={handleKeyDown}
            placeholder="Message Hermes or @mention an agent..."
            className="flex-1 rounded-xl px-4 py-3 text-sm resize-none outline-none transition-all duration-200 bg-[var(--app-surface)] border border-[var(--app-border)] text-[var(--app-text)]"
            style={{ minHeight: "44px", maxHeight: "120px" }}
            rows={1} disabled={streaming.isActive}
            onInput={(e) => { const t = e.currentTarget; t.style.height = "auto"; t.style.height = Math.min(t.scrollHeight, 120) + "px"; }} />
          <button onClick={streaming.isActive ? stopStreaming : sendMessage}
            className={`shrink-0 w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-200 font-bold text-sm ${
              streaming.isActive ? "" : "hover:-translate-y-0.5"
            }`}
            style={streaming.isActive
              ? { background: "var(--app-red-bg)", color: "var(--app-red)", border: "1px solid rgba(248,113,113,0.2)" }
              : { background: "linear-gradient(135deg, var(--app-accent), var(--app-accent-deep))", color: "#1d1c19", boxShadow: "0 2px 12px rgba(245,158,11,0.15)", opacity: input.trim() ? 1 : 0.5 }
            }
            disabled={!streaming.isActive && !input.trim()}>
            {streaming.isActive ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ color: "var(--app-red)" }}><rect x="6" y="6" width="12" height="12" rx="1" /></svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2L11 13" /><path d="M22 2l-7 20-4-9-9-4 20-7z" /></svg>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Session management bar in header ──

function SessionBar({
  sessions, sessionId, onCreateSession, onSelectSession, onRenameSession, onDeleteSession,
}: {
  sessions: WorkSession[];
  sessionId: number;
  onCreateSession: () => void;
  onSelectSession: (id: number) => void;
  onRenameSession: (id: number, title: string) => void;
  onDeleteSession: (id: number) => void;
}) {
  const [show, setShow] = useState(false);
  const [editing, setEditing] = useState<{ id: number; title: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const currentTitle = sessions.find((s) => s.id === sessionId)?.title || "新对话";

  const handleRename = () => {
    if (editing && editing.title.trim()) {
      onRenameSession(editing.id, editing.title.trim());
    }
    setEditing(null);
  };

  return (
    <div className="border-b border-[var(--app-border)]">
      <div className="px-3 py-2 flex items-center gap-2">
        <div className="relative flex-1 min-w-0">
          <button onClick={() => setShow(!show)}
            onDoubleClick={() => { setEditing({ id: sessionId, title: currentTitle }); setTimeout(() => inputRef.current?.select(), 0); }}
            className="flex items-center gap-1.5 w-full h-7 px-2.5 rounded-lg bg-[var(--app-surface)] border border-[var(--app-border)] text-sm font-medium text-[var(--app-text)] truncate hover:border-[var(--app-border-hover)] transition-colors"
            title="双击重命名">
            <span className="truncate flex-1 text-left">{currentTitle}</span>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--app-text-tertiary)" strokeWidth="2.5" strokeLinecap="round" className="shrink-0"
              style={{ transform: show ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}>
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          {show && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setShow(false)} />
              <div className="absolute top-full mt-1 left-0 right-0 z-40 rounded-xl bg-[var(--app-surface)] border border-[var(--app-border)] shadow-xl overflow-hidden"
                style={{ maxHeight: "240px", overflowY: "auto" }}>
                {sessions.map((s) => (
                  <div key={s.id}
                    className="px-3 py-2 text-sm cursor-pointer transition-colors hover:bg-[var(--app-accent-bg)] flex items-center justify-between group"
                    style={{ color: s.id === sessionId ? "var(--app-accent)" : "var(--app-text)" }}
                    onClick={() => { onSelectSession(s.id); setShow(false); }}>
                    <span className="truncate">{s.title}</span>
                    <span className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 shrink-0 ml-2">
                      <button onClick={(e) => { e.stopPropagation(); setEditing({ id: s.id, title: s.title }); setShow(false); }}
                        className="w-5 h-5 rounded-md flex items-center justify-center hover:bg-[var(--app-accent-bg)] transition-colors" title="重命名">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--app-text-secondary)" strokeWidth="2" strokeLinecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); if (confirm("Delete this session?")) onDeleteSession(s.id); }}
                        className="w-5 h-5 rounded-md flex items-center justify-center hover:bg-[var(--app-red-bg)] transition-colors" title="删除">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--app-red)" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                      </button>
                    </span>
                  </div>
                ))}
                <div className="border-t border-[var(--app-border)]" />
                <div onClick={() => { onCreateSession(); setShow(false); }}
                  className="px-3 py-2 text-sm cursor-pointer transition-colors hover:bg-[var(--app-accent-bg)] text-[var(--app-accent)] font-medium flex items-center gap-2">
                  <span className="text-base leading-none">+</span> 新对话
                </div>
              </div>
            </>
          )}
        </div>
        <button onClick={onCreateSession}
          className="w-6 h-6 rounded-full flex items-center justify-center text-sm font-medium transition-all duration-200 hover:scale-110 shrink-0 border border-[var(--app-accent-border)] text-[var(--app-accent)] hover:bg-[var(--app-accent-bg)]"
          title="新对话">+</button>

        {editing !== null && (
          <div className="fixed inset-0 z-50" onClick={handleRename} />
        )}
      </div>
      {editing !== null && (
        <div className="px-3 pb-2">
          <input ref={inputRef} value={editing.title}
            onChange={(e) => setEditing({ ...editing, title: e.target.value })}
            onBlur={handleRename}
            onKeyDown={(e) => { if (e.key === "Enter") handleRename(); if (e.key === "Escape") setEditing(null); }}
            className="w-full h-8 px-3 rounded-xl bg-[var(--app-surface)] border border-[var(--app-accent)] text-sm outline-none text-[var(--app-text)]"
            autoFocus />
        </div>
      )}
    </div>
  );
}

export default ChatPanel;
