import type { ChatMessage } from "@/types/work";
import { MarkdownContent } from "./StreamingMessage";
import type { ReactNode } from "react";

interface MessageListProps {
  messages: ChatMessage[];
  streamingMessage: ReactNode;
}

export function MessageList({ messages, streamingMessage }: MessageListProps) {
  return (
    <>
      {messages.map((msg) => (
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
      {streamingMessage}
    </>
  );
}
