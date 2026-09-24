import { useState, useRef, useEffect, useCallback } from "react";
import { SessionBar } from "./SessionBar";
import { StreamingMessage, type PhaseCard, type PhaseName } from "./StreamingMessage";
import { MessageList } from "./MessageList";
import { MentionInput } from "./MentionInput";
import { AgentAvatar, YumiAvatar } from "./icons";
import type { ChatMessage, WorkSession, WorkAgent } from "@/types/work";
import { extractMention, extractFileMention, activeMention, fileLabel, lastHashTrigger, type MentionKind } from "@/lib/mention";
import { loadWorkspaceFiles } from "@/lib/file-api";

export interface PhaseEvent {
  phase: PhaseName;
  meta?: Record<string, unknown>;
  text?: string;
}

export type { PhaseName, PhaseCard };

/** 模型没调 write_file 时不要打开/展示 (unsaved) 假文档 */
export function isPhantomWritePath(path: unknown): boolean {
  const p = String(path || "").trim();
  return !p || p === "(unsaved)";
}

function chatModeKey(sessionId: number) {
  return `work-chat-mode:${sessionId}`;
}

function chatFileKey(sessionId: number) {
  return `work-chat-file:${sessionId}`;
}

function readChatMode(sessionId: number): string | null | undefined {
  try {
    const v = sessionStorage.getItem(chatModeKey(sessionId));
    if (v === null) return undefined;
    return v || null;
  } catch {
    return undefined;
  }
}

function readChatFile(sessionId: number): string | null {
  try {
    return sessionStorage.getItem(chatFileKey(sessionId)) || null;
  } catch {
    return null;
  }
}

interface ChatPanelProps {
  sessionId: number;
  agents: WorkAgent[];
  sessions: WorkSession[];
  onFirstMessage?: (message: string) => void;
  onCreateSession: () => void;
  onSelectSession: (id: number) => void;
  onRenameSession: (id: number, title: string) => void;
  onDeleteSession: (id: number) => void;
  onPhase?: (event: PhaseEvent) => void;
  onStreamEnd?: () => void;
  onEmptyChange?: (empty: boolean) => void;
  onFocusFile?: (path: string) => void;
}

export function ChatPanel({
  sessionId, agents, sessions,
  onFirstMessage, onCreateSession, onSelectSession, onRenameSession, onDeleteSession,
  onPhase, onStreamEnd, onEmptyChange, onFocusFile,
}: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [phaseCards, setPhaseCards] = useState<PhaseCard[]>([]);
  const [streamActive, setStreamActive] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [streamThinking, setStreamThinking] = useState("");
  const [streamAgent, setStreamAgent] = useState<string | null>(null);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionKind, setMentionKind] = useState<MentionKind | null>(null);
  const [mentionFilter, setMentionFilter] = useState("");
  const [mentionIndex, setMentionIndex] = useState(0);
  const [chatMode, setChatMode] = useState<string | null>(() => readChatMode(sessionId) ?? null);
  const [focusFile, setFocusFile] = useState<string | null>(() => readChatFile(sessionId));
  const [wsFiles, setWsFiles] = useState<string[]>([]);
  const [hasCards, setHasCards] = useState(false);
  const [messagesReady, setMessagesReady] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const streamTextRef = useRef("");
  const streamThinkingRef = useRef("");
  const phaseCardsRef = useRef<PhaseCard[]>([]);
  const preStreamMaxIdRef = useRef(0);

  const agentNames = agents.map((a) => a.name);
  const avatarOf = (name: string | null | undefined) =>
    name ? agents.find((a) => a.name === name)?.avatar : undefined;

  const persistChatMode = useCallback((name: string | null) => {
    setChatMode(name);
    try {
      sessionStorage.setItem(chatModeKey(sessionId), name || "");
    } catch { /* ignore */ }
  }, [sessionId]);

  const persistFocusFile = useCallback((path: string | null) => {
    const rel = path ? path.replace(/^workspace\//, "") : null;
    setFocusFile(rel);
    try {
      if (rel) sessionStorage.setItem(chatFileKey(sessionId), rel);
      else sessionStorage.removeItem(chatFileKey(sessionId));
    } catch { /* ignore */ }
  }, [sessionId]);

  const reloadWsFiles = useCallback(async () => {
    try {
      const files = await loadWorkspaceFiles();
      setWsFiles(files.filter((f) => Number(f.isFolder) !== 1).map((f) => f.path.replace(/^workspace\//, "")));
    } catch { /* 列表失败时保留旧的 */ }
  }, []);

  useEffect(() => { void reloadWsFiles(); }, [sessionId, reloadWsFiles]);

  const applyMessages = useCallback((msgs: ChatMessage[]) => {
    setMessages(msgs);
    const stored = readChatMode(sessionId);
    if (stored === undefined) {
      const last = [...msgs].reverse().find((m) => m.role === "assistant");
      persistChatMode(last?.agentName || null);
    }
  }, [sessionId, persistChatMode]);

  const fetchMessages = useCallback(async (): Promise<ChatMessage[] | null> => {
    const res = await fetch(`/api/work/sessions/${sessionId}/messages`);
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data) ? data : null;
  }, [sessionId]);

  const loadMessages = useCallback(async (opts?: { retries?: number }) => {
    const attempts = Math.max(1, opts?.retries ?? 1);
    try {
      for (let i = 0; i < attempts; i++) {
        if (i > 0) await new Promise((r) => setTimeout(r, 280));
        const msgs = await fetchMessages();
        if (!msgs) {
          if (i === attempts - 1) {
            setLoadFailed(true);
            setMessagesReady(true);
          }
          continue;
        }
        setLoadFailed(false);
        applyMessages(msgs);
        setMessagesReady(true);
        if (opts?.retries && i < attempts - 1) {
          const hasAssistant = msgs.some((m) => m.role === "assistant");
          if (!hasAssistant) continue;
        }
        return;
      }
    } catch {
      setLoadFailed(true);
      setMessagesReady(true);
    }
  }, [fetchMessages, applyMessages]);

  const fetchMessagesRef = useRef(fetchMessages);
  fetchMessagesRef.current = fetchMessages;
  const applyMessagesRef = useRef(applyMessages);
  applyMessagesRef.current = applyMessages;

  // 切会话时：清空和拉取必须在同一个 effect 里，避免「先拉到消息再被另一个 effect 清掉」
  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    setMessages([]);
    setPhaseCards([]);
    phaseCardsRef.current = [];
    setStreamText("");
    streamTextRef.current = "";
    setStreamThinking("");
    streamThinkingRef.current = "";
    setStreamAgent(null);
    setHasCards(false);
    setLoadFailed(false);
    setMessagesReady(false);

    (async () => {
      try {
        const msgs = await fetchMessagesRef.current();
        if (cancelled) return;
        if (!msgs) {
          setLoadFailed(true);
          setMessagesReady(true);
          return;
        }
        applyMessagesRef.current(msgs);
        setLoadFailed(false);
        setMessagesReady(true);
      } catch {
        if (cancelled) return;
        setLoadFailed(true);
        setMessagesReady(true);
      }
    })();

    return () => {
      cancelled = true;
      abortRef.current?.abort();
    };
  }, [sessionId]);

  const onEmptyChangeRef = useRef(onEmptyChange);
  onEmptyChangeRef.current = onEmptyChange;
  useEffect(() => {
    if (!messagesReady || loadFailed) return;
    onEmptyChangeRef.current?.(messages.length === 0 && !input.trim());
  }, [messagesReady, messages.length, input, loadFailed]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, phaseCards]);

  const handleInput = (value: string, cursor?: number | null) => {
    setInput(value);
    const cursorPos = cursor ?? inputRef.current?.selectionStart ?? value.length;
    const beforeCursor = value.slice(0, cursorPos);
    const active = activeMention(beforeCursor, agentNames, wsFiles);
    if (active) {
      setMentionKind(active.kind);
      setMentionFilter(active.query);
      setShowMentions(true);
      setMentionIndex(0);
    } else {
      setShowMentions(false);
      setMentionKind(null);
    }
  };

  const insertMention = (agentName: string) => {
    const cursorPos = inputRef.current?.selectionStart || input.length;
    const beforeCursor = input.slice(0, cursorPos);
    const afterCursor = input.slice(cursorPos);
    const at = beforeCursor.lastIndexOf("@");
    if (at < 0) return;
    setInput(beforeCursor.slice(0, at) + `@${agentName} ` + afterCursor);
    persistChatMode(agentName);
    setShowMentions(false);
    setMentionKind(null);
    inputRef.current?.focus();
  };

  const insertFileMention = (fileName: string) => {
    const cursorPos = inputRef.current?.selectionStart || input.length;
    const beforeCursor = input.slice(0, cursorPos);
    const afterCursor = input.slice(cursorPos);
    const hash = lastHashTrigger(beforeCursor);
    if (hash < 0) return;
    setInput(beforeCursor.slice(0, hash) + `#${fileName} ` + afterCursor);
    persistFocusFile(fileName);
    onFocusFile?.(`workspace/${fileName.replace(/^workspace\//, "")}`);
    setShowMentions(false);
    setMentionKind(null);
    inputRef.current?.focus();
  };

  const sendMessage = async () => {
    if (!input.trim() || streamActive) return;
    const message = input.trim(); setInput("");
    if (messages.length === 0 && onFirstMessage) onFirstMessage(message);

    const tempId = -(Date.now());
    const optimisticMsg: ChatMessage = { id: tempId, role: "user", content: message, agentName: null, createdAt: new Date().toISOString() };
    setMessages((prev) => { preStreamMaxIdRef.current = prev.length > 0 ? Math.max(...prev.map(m => m.id)) : 0; return [...prev, optimisticMsg]; });

    const atName = extractMention(message, agentNames);
    const fileName = extractFileMention(message, wsFiles);
    const nextMode = atName || chatMode;
    if (atName) persistChatMode(atName);
    if (fileName) persistFocusFile(fileName);
    setStreamAgent(nextMode);
    setStreamActive(true);
    setPhaseCards([]);
    phaseCardsRef.current = [];
    setStreamText("");
    streamTextRef.current = "";
    setStreamThinking("");
    streamThinkingRef.current = "";
    setHasCards(true);

    const controller = new AbortController(); abortRef.current = controller;
    let aborted = false;
    try {
      const res = await fetch("/api/work/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          message,
          agentName: atName ? undefined : (nextMode || undefined),
          focusFile: (fileName || focusFile)
            ? `workspace/${(fileName || focusFile)!.replace(/^workspace\//, "")}`
            : undefined,
        }), signal: controller.signal,
      });
      if (res.ok) {
        const reader = res.body?.getReader();
        if (reader) {
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
        }
      }
    } catch (err: any) {
      if (err.name === "AbortError") aborted = true;
      else {
        const errCard: PhaseCard = { key: `err-${Date.now()}`, phase: "text", content: `Error: ${err.message}` };
        setPhaseCards((p) => { const next = [...p, errCard]; phaseCardsRef.current = next; return next; });
      }
    }
    abortRef.current = null;
    setStreamActive(false);
    await loadMessages({ retries: aborted ? 4 : 1 });
    void reloadWsFiles();
    setStreamText("");
    streamTextRef.current = "";
    setStreamThinking("");
    streamThinkingRef.current = "";
    setPhaseCards([]);
    phaseCardsRef.current = [];
    setHasCards(false);
    if (onStreamEnd) onStreamEnd();
  };

  const handleSSE = (event: any) => {
    const t = event.type;
    const p = event.phase as PhaseName | undefined;

    const pushCard = (card: PhaseCard) => {
      setPhaseCards((prev) => {
        const last = prev[prev.length - 1];
        if (card.phase !== "thinking" && last && last.phase === card.phase) {
          const a = last.meta || {};
          const b = card.meta || {};
          if (a.path === b.path && a.name === b.name && a.tool === b.tool && a.mode === b.mode) {
            return prev;
          }
        }
        const next = [...prev, card];
        phaseCardsRef.current = next;
        return next;
      });
    };

    if (t === "phase") {
      if (p === "text") return;
      if (p === "agent_start") {
        setStreamAgent(event.meta?.agentName as string || null);
        return;
      }
      if (p === "agent_done") return;
      if (p === "read" && String(event.meta?.path || "").startsWith("context/")) return;
      if (p === "write") {
        if (isPhantomWritePath(event.meta?.path)) return;
        if (onPhase) onPhase({ phase: "write", meta: event.meta });
      }
      pushCard({
        key: `card-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        phase: p || "text",
        meta: event.meta,
        content: "",
      });
    } else if (t === "delta") {
      if (p === "text") {
        setStreamText((prev) => prev + (event.text || ""));
        streamTextRef.current += (event.text || "");
      } else if (p === "thinking") {
        const chunk = event.text || "";
        setStreamThinking((prev) => prev + chunk);
        streamThinkingRef.current += chunk;
        setPhaseCards((prev) => {
          const last = prev[prev.length - 1];
          if (last?.phase === "thinking") {
            const next = [...prev.slice(0, -1), { ...last, content: last.content + chunk }];
            phaseCardsRef.current = next;
            return next;
          }
          const card: PhaseCard = {
            key: `think-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            phase: "thinking",
            content: chunk,
          };
          const next = [...prev, card];
          phaseCardsRef.current = next;
          return next;
        });
      } else if (p === "write") {
        if (isPhantomWritePath(event.meta?.path)) return;
        if (onPhase) onPhase({ phase: "write", meta: event.meta, text: event.text });
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
      pushCard({ key: `err-${Date.now()}`, phase: "text", content: event.message || "Unknown error" });
    }
  };

  const stopStreaming = () => {
    abortRef.current?.abort();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing || e.key === "Process") return;

    if (showMentions) {
      const pool = mentionKind === "file" ? wsFiles : agentNames;
      const filtered = pool.filter((a) => a.toLowerCase().includes(mentionFilter.toLowerCase()));
      if (filtered.length > 0) {
        if (e.key === "ArrowDown") { e.preventDefault(); setMentionIndex((i) => Math.min(i + 1, filtered.length - 1)); return; }
        if (e.key === "ArrowUp") { e.preventDefault(); setMentionIndex((i) => Math.max(i - 1, 0)); return; }
        if (e.key === "Enter" || e.key === "Tab") {
          e.preventDefault();
          const pick = filtered[mentionIndex];
          if (pick) mentionKind === "file" ? insertFileMention(pick) : insertMention(pick);
          return;
        }
        if (e.key === "Escape") { setShowMentions(false); setMentionKind(null); return; }
      } else if (e.key === "Escape") {
        setShowMentions(false);
        setMentionKind(null);
        return;
      }
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
        canCreate={messagesReady && !loadFailed && messages.length > 0}
      />

      <div className="px-3 pt-2 pb-1 grid grid-cols-2 gap-2 shrink-0">
        <div className="flex items-center gap-0.5 min-w-0">
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium min-w-0"
            style={{
              background: chatMode ? "rgba(139,123,184,0.12)" : "var(--app-accent-bg)",
              color: chatMode ? "#8b7bb8" : "var(--app-accent)",
            }}>
            {chatMode ? (
              <>
                <AgentAvatar name={chatMode} emoji={avatarOf(chatMode)} size={14} />
                <span className="truncate">@{chatMode}</span>
              </>
            ) : (
              <>
                <YumiAvatar size={14} />
                Yumi
              </>
            )}
          </div>
          {chatMode && (
            <button type="button" onClick={() => persistChatMode(null)}
              className="w-4 h-4 rounded-full flex items-center justify-center text-[10px] leading-none text-[var(--app-text-tertiary)] hover:text-[var(--app-red)] hover:bg-[var(--app-red-bg)] transition-colors shrink-0"
              title="取消选中，回到 Yumi">
              ✕
            </button>
          )}
        </div>
        <div className="flex items-center gap-0.5 min-w-0 justify-end">
          {focusFile && (
            <>
              <div className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium min-w-0"
                style={{ background: "var(--app-accent-bg)", color: "var(--app-accent)" }}>
                <span className="font-mono text-[10px]">#</span>
                <span className="truncate">{fileLabel(focusFile)}</span>
              </div>
              <button type="button" onClick={() => persistFocusFile(null)}
                className="w-4 h-4 rounded-full flex items-center justify-center text-[10px] leading-none text-[var(--app-text-tertiary)] hover:text-[var(--app-red)] hover:bg-[var(--app-red-bg)] transition-colors shrink-0"
                title="取消指定文档">
                ✕
              </button>
            </>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto px-3 py-4 space-y-5">
        {!messagesReady && !loadFailed && (
          <div className="text-[12px] text-[var(--app-text-tertiary)] animate-pulse">加载对话…</div>
        )}
        {loadFailed && (
          <div className="text-center space-y-2 py-8">
            <p className="text-[12px] text-[var(--app-text-secondary)]">对话记录加载失败</p>
            <button
              type="button"
              onClick={() => { setLoadFailed(false); setMessagesReady(false); void loadMessages(); }}
              className="px-3 py-1 rounded-lg text-[12px] font-medium bg-[var(--app-accent-bg)] text-[var(--app-accent)] hover:scale-105 transition-all"
            >
              重试
            </button>
          </div>
        )}
        <MessageList
          messages={visibleMessages}
          avatarOf={avatarOf}
          streamingMessage={
            <StreamingMessage
              streamAgent={streamAgent}
              streamAvatar={avatarOf(streamAgent)}
              streamText={streamText}
              streamThinking={streamThinking}
              phaseCards={phaseCards}
              streamActive={streamActive}
              hasCards={hasCards}
              thinkingOpen={false}
              onToggleThinking={() => {}}
            />
          }
        />
        <div ref={messagesEndRef} />
      </div>

      <MentionInput
        input={input}
        onInputChange={handleInput}
        onKeyDown={handleKeyDown}
        inputRef={inputRef}
        agents={agentNames}
        files={wsFiles}
        showMentions={showMentions}
        mentionKind={mentionKind}
        mentionFilter={mentionFilter}
        mentionIndex={mentionIndex}
        streamActive={streamActive}
        onSend={sendMessage}
        onStop={stopStreaming}
        onInsertMention={(name) => mentionKind === "file" ? insertFileMention(name) : insertMention(name)}
      />
    </div>
  );
}

export default ChatPanel;
