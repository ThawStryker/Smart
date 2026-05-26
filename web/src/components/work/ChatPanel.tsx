import { useState, useRef, useEffect, useCallback } from "react";
import { SessionBar } from "./SessionBar";
import type { ChatMessage, StreamingState, WorkSession } from "@/types/work";

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

export default ChatPanel;
