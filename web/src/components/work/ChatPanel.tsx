import { useState, useRef, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { SessionBar } from "./SessionBar";
import type { ChatMessage, WorkSession } from "@/types/work";

export interface PhaseEvent {
  phase: PhaseName;
  meta?: Record<string, unknown>;
  text?: string;
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
  onPhase?: (event: PhaseEvent) => void;
  onStreamEnd?: () => void;
}

// ── Agent avatar ──

const agentAvatars = ["🐱","🐶","🦊","🐼","🐨","🐯","🦁","🐸","🐵","🐰","🐻","🦄","🐙","🦋","🐞","🐣","🦉","🐳","🦀","🐲"];
function getAvatar(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  return agentAvatars[Math.abs(hash) % agentAvatars.length];
}

// ── Phase display mapping ──

type PhaseName = "thinking" | "agent_start" | "agent_done" | "read" | "memory" | "skill" | "search" | "write" | "text";

interface PhaseCard {
  key: string;
  phase: PhaseName;
  meta?: Record<string, unknown>;
  content: string;
}

const phaseDisplay: Record<string, { icon: string; label: string }> = {
  thinking: { icon: "💭", label: "Thinking" },
  agent_start: { icon: "🤖", label: "" },
  read: { icon: "📖", label: "Read" },
  memory: { icon: "🧠", label: "Memory" },
  skill: { icon: "🎯", label: "Skill" },
  search: { icon: "🔍", label: "Search" },
  write: { icon: "✍️", label: "Writing" },
};

function getPhaseLabel(phase: PhaseName, meta?: Record<string, unknown>): string {
  const display = phaseDisplay[phase];
  if (!display) return phase;

  if (phase === "agent_start" && meta?.agentName) return `🤖 ${meta.agentName}`;
  if (phase === "read" && meta?.path) {
    const file = (meta.path as string).split("/").pop() || meta.path;
    return `📖 Read ${file}`;
  }
  if (phase === "write" && meta?.path) {
    const file = (meta.path as string).split("/").pop() || meta.path;
    return `✍️ Write ${file}`;
  }
  if (phase === "search" && meta?.query) return `🔍 ${meta.query}`;
  if (phase === "skill" && meta?.name) return `🎯 ${meta.name}`;
  if (phase === "memory" && meta?.entry) return `🧠 ${meta.entry}`;

  return `${display.icon} ${display.label}`;
}

// ── Markdown component ──

function MarkdownContent({ content }: { content: string }) {
  if (!content) return null;
  return (
    <div className="markdown-body">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>
        {content}
      </ReactMarkdown>
    </div>
  );
}

export function ChatPanel({
  sessionId, agents, sessions,
  onFirstMessage, onCreateSession, onSelectSession, onRenameSession, onDeleteSession,
  onPhase, onStreamEnd,
}: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [phaseCards, setPhaseCards] = useState<PhaseCard[]>([]);
  const [streamActive, setStreamActive] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [streamAgent, setStreamAgent] = useState<string | null>(null);
  const [thinkingOpen, setThinkingOpen] = useState<Set<number>>(new Set());
  const [showMentions, setShowMentions] = useState(false);
  const [mentionFilter, setMentionFilter] = useState("");
  const [mentionIndex, setMentionIndex] = useState(0);
  const [chatMode, setChatMode] = useState<string | null>(null);
  const [hasCards, setHasCards] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const userScrolledUpRef = useRef(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const onStreamEndRef = useRef(onStreamEnd);
  onStreamEndRef.current = onStreamEnd;
  const mountedRef = useRef(false);
  const streamTextRef = useRef("");
  const phaseCardsRef = useRef<PhaseCard[]>([]);
  const preStreamMaxIdRef = useRef(0);

  const loadMessages = useCallback(async () => {
    const res = await fetch(`/api/work/sessions/${sessionId}/messages`);
    if (res.ok) {
      const msgs: ChatMessage[] = await res.json();
      setMessages(msgs);
    }
  }, [sessionId]);

  useEffect(() => { if (sessionId) loadMessages(); }, [sessionId, loadMessages]);

  useEffect(() => {
    if (!mountedRef.current) { mountedRef.current = true; return; }
    if (!streamActive) onStreamEndRef.current?.();
  }, [streamActive]);

  // Reset session-scoped state
  useEffect(() => {
    setMessages([]);
    setPhaseCards([]);
    phaseCardsRef.current = [];
    setStreamText("");
    streamTextRef.current = "";
    setStreamAgent(null);
    setHasCards(false);
  }, [sessionId]);

  // Scroll lock
  const scrollToBottom = (smooth = true) => {
    userScrolledUpRef.current = false;
    messagesEndRef.current?.scrollIntoView({ behavior: smooth ? "smooth" : "auto" });
  };
  useEffect(() => {
    if (!userScrolledUpRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, phaseCards]);
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
    userScrolledUpRef.current = !isNearBottom;
  };

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

    const tempId = -(Date.now());
    const optimisticMsg: ChatMessage = { id: tempId, role: "user", content: message, agentName: null, createdAt: new Date().toISOString() };
    setMessages((prev) => { preStreamMaxIdRef.current = prev.length > 0 ? Math.max(...prev.map(m => m.id)) : 0; return [...prev, optimisticMsg]; });

    const isDirectChat = !message.includes("@");
    if (!isDirectChat) {
      const atName = message.match(/@(\S+)/)?.[1] || null;
      if (atName) setChatMode(atName);
    }
    setStreamActive(true);
    setPhaseCards([]);
    phaseCardsRef.current = [];
    setStreamText("");
    streamTextRef.current = "";
    setStreamAgent(null);
    setThinkingOpen(new Set());
    setHasCards(true);

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
        const errCard: PhaseCard = { key: `err-${Date.now()}`, phase: "text", content: `Error: ${err.message}` };
        setPhaseCards((p) => { const next = [...p, errCard]; phaseCardsRef.current = next; return next; });
      }
    }
    if (onStreamEnd) onStreamEnd();
    setStreamActive(false); abortRef.current = null;
    loadMessages();
  };

  const handleSSE = (event: any) => {
    const t = event.type;
    const p = event.phase as PhaseName | undefined;

    if (t === "phase") {
      // text phase 是对话内容，不做卡片
      if (p === "text") return;

      if (p === "agent_start") {
        setStreamAgent(event.meta?.agentName as string || null);
      }
      if (p === "agent_done") {
        setStreamAgent(null);
        // 标记最后一个 agent_start 卡片为 done
        setPhaseCards((prev) => {
          const next = [...prev];
          for (let i = next.length - 1; i >= 0; i--) {
            if (next[i].phase === "agent_start") {
              next[i] = { ...next[i], content: "✓" };
              break;
            }
          }
          phaseCardsRef.current = next;
          return next;
        });
        return;
      }
      // write phase → 通知上层打开文件
      if (p === "write" && event.meta?.path && onPhase) {
        onPhase({ phase: "write", meta: event.meta });
      }
      const card: PhaseCard = {
        key: `card-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        phase: p || "text",
        meta: event.meta,
        content: "",
      };
      setPhaseCards((prev) => { const next = [...prev, card]; phaseCardsRef.current = next; return next; });
    } else if (t === "delta") {
      if (p === "text") {
        // 文本增量 → 追加到对话区
        setStreamText((prev) => prev + (event.text || ""));
        streamTextRef.current += (event.text || "");
      } else if (p === "write") {
        // write delta → 通知上层追加到编辑器
        if (onPhase && event.meta?.path) {
          onPhase({ phase: "write", meta: event.meta, text: event.text });
        }
      } else if (p) {
        // 其他 delta → 追加到最后一个同 phase 的卡片
        setPhaseCards((prev) => {
          const next = [...prev];
          for (let i = next.length - 1; i >= 0; i--) {
            if (next[i].phase === p) {
              next[i] = { ...next[i], content: next[i].content + (event.text || "") };
              break;
            }
          }
          phaseCardsRef.current = next;
          return next;
        });
      }
    } else if (t === "error") {
      const errCard: PhaseCard = { key: `err-${Date.now()}`, phase: "text", content: `⚠️ ${event.message || "Unknown error"}` };
      setPhaseCards((prev) => { const next = [...prev, errCard]; phaseCardsRef.current = next; return next; });
    }
    // "done" 事件不在这里处理——由 while 循环结束自然触发
  };

  const stopStreaming = () => {
    abortRef.current?.abort();
    setStreamActive(false);
    if (onStreamEnd) onStreamEnd();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showMentions) {
      const filtered = agents.filter((a) => a.toLowerCase().startsWith(mentionFilter.toLowerCase()));
      if (e.key === "ArrowDown") { e.preventDefault(); setMentionIndex((i) => Math.min(i + 1, filtered.length - 1)); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setMentionIndex((i) => Math.max(i - 1, 0)); }
      else if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); if (filtered[mentionIndex]) insertMention(filtered[mentionIndex]); }
      else if (e.key === "Escape") setShowMentions(false);
      return;
    }
    if ((e.key === "Enter" && !e.shiftKey) || ((e.metaKey || e.ctrlKey) && e.key === "Enter")) { e.preventDefault(); sendMessage(); }
  };

  const filteredMentions = agents.filter((a) => a.toLowerCase().startsWith(mentionFilter.toLowerCase()));

  const hasStreamContent = phaseCards.length > 0 || streamText !== "";
  const visibleMessages = hasStreamContent
    ? messages.filter((m) => !(m.role === "assistant" && m.id > preStreamMaxIdRef.current && m.id < 0))
    : messages;

  return (
    <div className="flex flex-col h-full bg-[var(--app-bg)]">
      <SessionBar
        sessions={sessions} sessionId={sessionId}
        onCreateSession={onCreateSession} onSelectSession={onSelectSession}
        onRenameSession={onRenameSession} onDeleteSession={onDeleteSession}
      />

      {/* 模式指示器 */}
      <div className="px-3 pt-2 pb-0 flex items-center gap-2">
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider"
          style={{
            background: chatMode ? "rgba(167,139,250,0.1)" : "var(--app-accent-bg)",
            color: chatMode ? "#a78bfa" : "var(--app-accent)",
          }}>
          {chatMode ? `🤖 @${chatMode}` : "💬 Yumi"}
        </div>
        {chatMode && (
          <button onClick={() => setChatMode(null)}
            className="text-[10px] text-[var(--app-text-tertiary)] hover:text-[var(--app-text-secondary)] transition-colors"
            title="切换回 Yumi 模式">
            切换
          </button>
        )}
      </div>

      <div className="flex-1 overflow-auto px-4 py-3 space-y-3" ref={messagesContainerRef} onScroll={handleScroll}>
        {visibleMessages.map((msg) => (
          <div key={msg.id} className="animate-pageIn">
            <div className="flex items-center gap-2 mb-1">
              {msg.role === "user" ? (
                <span className="text-xs font-bold uppercase tracking-wider text-[var(--app-accent)]">You</span>
              ) : (
                <>
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: msg.agentName ? "#a78bfa" : "var(--app-text-secondary)" }} />
                  <span className="text-xs font-bold uppercase tracking-wider" style={{ color: msg.agentName ? "#a78bfa" : "var(--app-text-secondary)" }}>
                    {msg.agentName || "Yumi"}
                  </span>
                </>
              )}
            </div>
            <div className="text-sm leading-relaxed whitespace-pre-wrap rounded-xl px-4 py-3 text-[var(--app-text)]"
              style={{ background: msg.role === "user" ? "rgba(255,255,255,0.04)" : "transparent", border: msg.role === "user" ? "1px solid var(--app-border)" : "none" }}>
              <MarkdownContent content={msg.content} />
            </div>
          </div>
        ))}

        {/* Phase cards */}
        {(streamActive || phaseCards.length > 0) && hasCards && phaseCards.map((card, i) => {
          // thinking → 折叠卡片
          if (card.phase === "thinking") {
            const open = thinkingOpen.has(i);
            return (
              <div key={card.key} className="animate-pageIn">
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
                  <div className="mt-1 ml-5 text-xs leading-relaxed whitespace-pre-wrap text-[var(--app-text-secondary)]">{card.content}</div>
                )}
              </div>
            );
          }

          // agent_start → 子 agent 卡片
          if (card.phase === "agent_start") {
            const name = (card.meta?.agentName as string) || "Agent";
            const avatar = getAvatar(name);
            return (
              <div key={card.key} className="animate-pageIn flex items-center gap-2 py-1">
                <span className="text-sm leading-none">{avatar}</span>
                <span className="text-xs font-bold uppercase tracking-wider text-[var(--app-text-secondary)]">{name}</span>
              </div>
            );
          }

          // 普通 phase 卡片（read/memory/skill/search/write）
          const label = getPhaseLabel(card.phase, card.meta);
          return (
            <div key={card.key} className="animate-pageIn flex items-center gap-2 py-1 pl-1">
              <span className="text-xs">{phaseDisplay[card.phase]?.icon || "🔧"}</span>
              <span className="text-xs text-[var(--app-text-secondary)]">{label}</span>
            </div>
          );
        })}

        {/* 流式文本（text phase delta） */}
        {(streamActive || streamText !== "") && (
          <div className="animate-pageIn">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: streamAgent ? "#a78bfa" : "var(--app-text-secondary)" }} />
              <span className="text-xs font-bold uppercase tracking-wider" style={{ color: streamAgent ? "#a78bfa" : "var(--app-text-secondary)" }}>
                {streamAgent || "Yumi"}
              </span>
            </div>
            <div className="text-sm leading-relaxed whitespace-pre-wrap text-[var(--app-text)]">
              {streamText ? <MarkdownContent content={streamText} /> : (streamActive ? "" : "")}
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
        {userScrolledUpRef.current && (
          <div className="flex justify-center pb-2">
            <button onClick={() => scrollToBottom(true)}
              className="px-3 py-1.5 rounded-full text-[10px] font-bold shadow-lg transition-all hover:scale-105"
              style={{ background: "var(--app-accent-bg)", color: "var(--app-accent)" }}>
              ↓ 跳到底部
            </button>
          </div>
        )}
      </div>

      <div className="border-t border-[var(--app-border)]">
        {showMentions && filteredMentions.length > 0 && (
          <div className="mx-3 mt-2 rounded-xl overflow-hidden shadow-lg bg-[var(--app-surface)] border border-[var(--app-border)] max-h-48 overflow-y-auto">
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
              placeholder="Message Yumi or @mention an agent..."
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
