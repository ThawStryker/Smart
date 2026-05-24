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

interface ChatPanelProps {
  sessionId: number;
  agents: string[];
}

export function ChatPanel({ sessionId, agents }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState<StreamingState>({
    agentName: null,
    content: "",
    isActive: false,
  });
  const [showMentions, setShowMentions] = useState(false);
  const [mentionFilter, setMentionFilter] = useState("");
  const [mentionIndex, setMentionIndex] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const loadMessages = useCallback(async () => {
    const res = await fetch(`/api/work/sessions/${sessionId}/messages`);
    if (res.ok) {
      setMessages(await res.json());
    }
  }, [sessionId]);

  useEffect(() => {
    if (sessionId) loadMessages();
  }, [sessionId, loadMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streaming.content]);

  const handleInput = (value: string) => {
    setInput(value);
    const cursorPos = inputRef.current?.selectionStart || value.length;
    const beforeCursor = value.slice(0, cursorPos);
    const atMatch = beforeCursor.match(/@(\S*)$/);
    if (atMatch) {
      setMentionFilter(atMatch[1]);
      setShowMentions(true);
      setMentionIndex(0);
    } else {
      setShowMentions(false);
    }
  };

  const insertMention = (agentName: string) => {
    const cursorPos = inputRef.current?.selectionStart || input.length;
    const beforeCursor = input.slice(0, cursorPos);
    const afterCursor = input.slice(cursorPos);
    const atMatch = beforeCursor.match(/@(\S*)$/);
    if (atMatch) {
      const beforeAt = beforeCursor.slice(0, beforeCursor.length - atMatch[0].length);
      setInput(beforeAt + `@${agentName} ` + afterCursor);
    }
    setShowMentions(false);
    inputRef.current?.focus();
  };

  const sendMessage = async () => {
    if (!input.trim() || streaming.isActive) return;
    const message = input.trim();
    setInput("");
    setStreaming({ agentName: null, content: "", isActive: true });

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/work/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, message }),
        signal: controller.signal,
      });

      if (!res.ok) {
        setStreaming((prev) => ({
          ...prev,
          content: `Error: ${res.status} ${res.statusText}`,
          isActive: false,
        }));
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        setStreaming({ agentName: null, content: "", isActive: false });
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6));
            switch (event.type) {
              case "text":
                setStreaming((prev) => ({
                  agentName: event.agentName || prev.agentName,
                  content: prev.content + (event.delta || ""),
                  isActive: true,
                }));
                break;

              case "agent_start":
                setStreaming({
                  agentName: event.agentName,
                  content: "",
                  isActive: true,
                });
                break;

              case "tool_exec":
                setStreaming((prev) => ({
                  ...prev,
                  content: prev.content + `\n\n> Using ${event.toolName}...`,
                }));
                break;

              case "error":
                setStreaming((prev) => ({
                  ...prev,
                  content: prev.content + `\n\nError: ${event.message}`,
                }));
                break;

              case "agent_done":
                // Will be finalized on done event
                break;
            }
          } catch {}
        }
      }
    } catch (err: any) {
      if (err.name !== "AbortError") {
        setStreaming((prev) => ({
          ...prev,
          content: prev.content + `\n\nError: ${err.message}`,
        }));
      }
    }

    setStreaming((prev) => ({ ...prev, isActive: false }));
    abortRef.current = null;
    loadMessages();
  };

  const stopStreaming = () => {
    abortRef.current?.abort();
    setStreaming((prev) => ({ ...prev, isActive: false }));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showMentions) {
      const filtered = agents.filter((a) =>
        a.toLowerCase().startsWith(mentionFilter.toLowerCase()),
      );
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionIndex((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        if (filtered[mentionIndex]) insertMention(filtered[mentionIndex]);
      } else if (e.key === "Escape") {
        setShowMentions(false);
      }
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const filteredMentions = agents.filter((a) =>
    a.toLowerCase().startsWith(mentionFilter.toLowerCase()),
  );

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-auto px-3 py-2 space-y-3">
        {messages.map((msg) => (
          <div key={msg.id}>
            <div className="flex items-center gap-1 mb-0.5">
              <span className="text-xs font-semibold text-gray-500">
                {msg.role === "user" ? "You" : msg.agentName || "Hermes"}
              </span>
            </div>
            <div className="text-sm text-gray-800 whitespace-pre-wrap">
              {msg.content}
            </div>
          </div>
        ))}

        {/* Streaming message */}
        {streaming.isActive && (
          <div>
            <div className="flex items-center gap-1 mb-0.5">
              <span className="text-xs font-semibold text-blue-600">
                {streaming.agentName || "Hermes"}
              </span>
              <span className="inline-block w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse" />
            </div>
            <div className="text-sm text-gray-800 whitespace-pre-wrap">
              {streaming.content || "Thinking..."}
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="border-t p-3">
        {/* @mention dropdown */}
        {showMentions && filteredMentions.length > 0 && (
          <div className="bg-white border rounded-lg shadow mb-2 max-h-32 overflow-auto">
            {filteredMentions.map((agent, i) => (
              <div
                key={agent}
                className={`px-3 py-1.5 text-sm cursor-pointer ${
                  i === mentionIndex ? "bg-blue-50 text-blue-700" : "hover:bg-gray-50"
                }`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  insertMention(agent);
                }}
              >
                @{agent}
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => handleInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message, @mention an agent..."
            className="flex-1 border rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-blue-500"
            rows={2}
            disabled={streaming.isActive}
          />
          <button
            onClick={streaming.isActive ? stopStreaming : sendMessage}
            className={`px-4 rounded-lg text-sm font-medium transition-colors ${
              streaming.isActive
                ? "bg-red-500 text-white hover:bg-red-600"
                : "bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            }`}
            disabled={!streaming.isActive && !input.trim()}
          >
            {streaming.isActive ? "■" : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ChatPanel;
