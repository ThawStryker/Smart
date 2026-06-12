import { useState, useRef, useEffect, useCallback } from "react";
import { SessionBar } from "./SessionBar";
import { StreamingMessage, type PhaseCard, type PhaseName } from "./StreamingMessage";
import { MessageList } from "./MessageList";
import { MentionInput } from "./MentionInput";
import type { ChatMessage, WorkSession } from "@/types/work";

export interface PhaseEvent {
  phase: PhaseName;
  meta?: Record<string, unknown>;
  text?: string;
}

export type { PhaseName, PhaseCard };

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
  const [streamThinking, setStreamThinking] = useState("");
  const [streamAgent, setStreamAgent] = useState<string | null>(null);
  const [thinkingOpen, setThinkingOpen] = useState(false);
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
  const streamThinkingRef = useRef("");
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

  useEffect(() => {
    setMessages([]);
    setPhaseCards([]);
    phaseCardsRef.current = [];
    setStreamText("");
    streamTextRef.current = "";
    setStreamThinking("");
    streamThinkingRef.current = "";
    setStreamAgent(null);
    setHasCards(false);
  }, [sessionId]);

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
    setStreamThinking("");
    streamThinkingRef.current = "";
    setStreamAgent(null);
    setThinkingOpen(false);
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
  };

  const handleSSE = (event: any) => {
    const t = event.type;
    const p = event.phase as PhaseName | undefined;

    if (t === "phase") {
      if (p === "text") return;
      if (p === "agent_start") {
        setStreamAgent(event.meta?.agentName as string || null);
        return;
      }
      if (p === "agent_done") return;
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
        setStreamText((prev) => prev + (event.text || ""));
        streamTextRef.current += (event.text || "");
      } else if (p === "thinking") {
        setStreamThinking((prev) => prev + (event.text || ""));
        streamThinkingRef.current += (event.text || "");
      } else if (p === "write") {
        if (onPhase && event.meta?.path) {
          onPhase({ phase: "write", meta: event.meta, text: event.text });
        }
      } else if (p) {
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

  const hasStreamContent = streamActive || phaseCards.length > 0 || streamText !== "" || streamThinking !== "";
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
        <MessageList
          messages={visibleMessages}
          streamingMessage={
            <StreamingMessage
              streamAgent={streamAgent}
              streamText={streamText}
              streamThinking={streamThinking}
              phaseCards={phaseCards}
              streamActive={streamActive}
              hasCards={hasCards}
              thinkingOpen={thinkingOpen}
              onToggleThinking={() => setThinkingOpen((p) => !p)}
            />
          }
        />
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

      <MentionInput
        input={input}
        onInputChange={handleInput}
        onKeyDown={handleKeyDown}
        agents={agents}
        showMentions={showMentions}
        mentionFilter={mentionFilter}
        mentionIndex={mentionIndex}
        streamActive={streamActive}
        onSend={sendMessage}
        onStop={stopStreaming}
        onInsertMention={insertMention}
      />
    </div>
  );
}

export default ChatPanel;
