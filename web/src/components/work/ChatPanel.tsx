import { useState, useRef, useEffect, useCallback } from "react";
import { SessionBar } from "./SessionBar";
import type { ChatMessage, WorkSession } from "@/types/work";

interface ChatPanelProps {
  sessionId: number;
  agents: string[];
  sessions: WorkSession[];
  onFirstMessage?: (message: string) => void;
  onCreateSession: () => void;
  onSelectSession: (id: number) => void;
  onRenameSession: (id: number, title: string) => void;
  onDeleteSession: (id: number) => void;
  onOpenFile?: (path: string) => void;
}

// ── Agent avatar (same hash as AgentPanel) ──

const agentAvatars = ["🐱","🐶","🦊","🐼","🐨","🐯","🦁","🐸","🐵","🐰","🐻","🦄","🐙","🦋","🐞","🐣","🦉","🐳","🦀","🐲"];
function getAvatar(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  return agentAvatars[Math.abs(hash) % agentAvatars.length];
}

// ── Tool icon + label mapping ──

const toolMeta: Record<string, { icon: string; label: string }> = {
  read_file: { icon: "📖", label: "Read" },
  write_file: { icon: "✍️", label: "Writing" },
  edit_file: { icon: "✏️", label: "Edit" },
  web_search: { icon: "🔍", label: "Search" },
  list_files: { icon: "📂", label: "List" },
  call_agent: { icon: "🤖", label: "Agent" },
};

function getToolLabel(name: string, args?: Record<string, unknown>): string {
  const meta = toolMeta[name];
  if (!meta) return name;
  if (name === "read_file" || name === "write_file" || name === "edit_file") {
    const path = (args?.path as string) || "";
    const file = path.split("/").pop() || path;
    return `${meta.label} ${file}`;
  }
  if (name === "web_search") {
    return `${meta.label} ${(args?.query as string) || ""}`;
  }
  if (name === "list_files") {
    return `${meta.label} ${(args?.prefix as string) || "/"}`;
  }
  return meta.label;
}

// ── Streaming step type ──

interface StreamStep {
  key: string;
  type: "thinking" | "agent_card" | "tool" | "text";
  agentName?: string;
  toolName?: string;
  args?: Record<string, unknown>;
  content: string;
}

export function ChatPanel({
  sessionId, agents, sessions,
  onFirstMessage, onCreateSession, onSelectSession, onRenameSession, onDeleteSession,
  onOpenFile,
}: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streamSteps, setStreamSteps] = useState<StreamStep[]>([]);
  const [streamActive, setStreamActive] = useState(false);
  const [thinkingOpen, setThinkingOpen] = useState<Set<number>>(new Set());
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
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, streamSteps]);

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
    if (!input.trim() || streamActive) return;
    const message = input.trim(); setInput("");
    if (messages.length === 0 && onFirstMessage) onFirstMessage(message);

    setStreamActive(true);
    setStreamSteps([]);
    setThinkingOpen(new Set());

    const controller = new AbortController(); abortRef.current = controller;
    try {
      const res = await fetch("/api/work/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, message }), signal: controller.signal,
      });
      if (!res.ok) { setStreamActive(false); return; }
      const reader = res.body?.getReader();
      if (!reader) { setStreamActive(false); return; }
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
            handleSSE(event);
          } catch {}
        }
      }
    } catch (err: any) {
      if (err.name !== "AbortError") {
        setStreamSteps((p) => [...p, { key: `err-${Date.now()}`, type: "text", content: `Error: ${err.message}` }]);
      }
    }
    setStreamActive(false); abortRef.current = null; loadMessages();
  };

  const handleSSE = (event: any) => {
    const t = event.type;
    if (t === "thinking") {
      setStreamSteps((p) => {
        const last = p[p.length - 1];
        if (last?.type === "thinking") {
          const updated = [...p];
          updated[p.length - 1] = { ...last, content: last.content + (event.delta || "") };
          return updated;
        }
        return [...p, { key: `think-${p.length}`, type: "thinking", content: event.delta || "" }];
      });
    } else if (t === "agent_start") {
      setStreamSteps((p) => [...p, { key: `agent-${p.length}`, type: "agent_card", agentName: event.agentName, content: "" }]);
    } else if (t === "tool_exec") {
      const toolName = event.toolName;
      // Auto-open file on write/edit
      if ((toolName === "write_file" || toolName === "edit_file") && onOpenFile) {
        const path = event.args?.path as string;
        if (path) onOpenFile(path);
      }
      setStreamSteps((p) => [...p, { key: `tool-${p.length}`, type: "tool", toolName, args: event.args, content: "" }]);
    } else if (t === "agent_done") {
      // mark completion — no visual change needed
    } else if (t === "text") {
      setStreamSteps((p) => [...p, { key: `txt-${p.length}`, type: "text", agentName: event.agentName, content: event.delta || "" }]);
    } else if (t === "doc") {
      // streaming doc content — handled by onOpenFile above
    }
  };

  const stopStreaming = () => { abortRef.current?.abort(); setStreamActive(false); };

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
      <SessionBar
        sessions={sessions} sessionId={sessionId}
        onCreateSession={onCreateSession} onSelectSession={onSelectSession}
        onRenameSession={onRenameSession} onDeleteSession={onDeleteSession}
      />

      <div className="flex-1 overflow-auto px-4 py-3 space-y-3">
        {messages.map((msg) => (
          <div key={msg.id} className="animate-pageIn">
            <div className="flex items-center gap-2 mb-1">
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

        {/* Streaming steps */}
        {streamActive && streamSteps.map((step, i) => {
          if (step.type === "thinking") {
            const open = thinkingOpen.has(i);
            return (
              <div key={step.key} className="animate-pageIn">
                <div className="flex items-center gap-2 cursor-pointer" onClick={() => {
                  setThinkingOpen((p) => { const n = new Set(p); if (n.has(i)) n.delete(i); else n.add(i); return n; });
                }}>
                  <span className="text-xs opacity-60">💭</span>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--app-text-tertiary)]">Thinking</span>
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="var(--app-text-tertiary)" strokeWidth="3" style={{ transform: open ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform 0.15s" }}>
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </div>
                {open && (
                  <div className="mt-1 ml-5 text-xs leading-relaxed whitespace-pre-wrap text-[var(--app-text-secondary)]">{step.content}</div>
                )}
              </div>
            );
          }

          if (step.type === "agent_card") {
            const name = step.agentName || "Agent";
            const avatar = getAvatar(name);
            return (
              <div key={step.key} className="animate-pageIn flex items-center gap-2 py-1">
                <span className="text-sm leading-none">{avatar}</span>
                <span className="text-xs font-bold uppercase tracking-wider text-[var(--app-text-secondary)]">{name}</span>
              </div>
            );
          }

          if (step.type === "tool") {
            const label = getToolLabel(step.toolName || "", step.args);
            const meta = toolMeta[step.toolName || ""];
            const icon = meta?.icon || "🔧";
            return (
              <div key={step.key} className="animate-pageIn flex items-center gap-2 py-1 pl-1">
                <span className="text-xs">{icon}</span>
                <span className="text-xs text-[var(--app-text-secondary)]">{label}</span>
              </div>
            );
          }

          // type === "text"
          const isHermes = !step.agentName;
          return (
            <div key={step.key} className="animate-pageIn">
              {isHermes && (
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--app-text-secondary)" }} />
                  <span className="text-xs font-bold uppercase tracking-wider text-[var(--app-text-secondary)]">Hermes</span>
                </div>
              )}
              <div className="text-sm leading-relaxed whitespace-pre-wrap text-[var(--app-text)]">{step.content}</div>
            </div>
          );
        })}

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
        <div className="p-3">
          <div className="relative">
            <textarea ref={inputRef} value={input}
              onChange={(e) => handleInput(e.target.value)} onKeyDown={handleKeyDown}
              placeholder="Message Hermes or @mention an agent..."
              className="w-full rounded-xl px-4 py-3 pr-12 text-sm resize-none outline-none transition-all duration-200 bg-[var(--app-surface)] border border-[var(--app-border)] text-[var(--app-text)] overflow-y-auto [scrollbar-gutter:stable]"
              style={{ height: "80px" }}
              rows={3} disabled={streamActive} />
            <button onClick={streamActive ? stopStreaming : sendMessage}
              disabled={!streamActive && !input.trim()}
              className="absolute right-3 bottom-3 w-8 h-8 rounded-full flex items-center justify-center shadow-sm hover:shadow-md transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: "linear-gradient(135deg, var(--app-accent), var(--app-accent-deep))", color: "#1d1c19" }}>
              {streamActive ? "■" : "➤"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ChatPanel;
