import type { ChatMessage } from "@/types/work";
import { AssistantTurn, MarkdownContent, type PhaseCard } from "./StreamingMessage";
import type { ReactNode } from "react";

interface MessageListProps {
  messages: ChatMessage[];
  streamingMessage: ReactNode;
  avatarOf?: (name: string | null | undefined) => string | undefined;
}

function UserTurn({ content }: { content: string }) {
  return (
    <div className="flex justify-end">
      <div
        className="max-w-[88%] rounded-2xl rounded-tr-md px-3.5 py-2 text-[13px] leading-[1.65] text-[var(--app-text)] break-words"
        style={{ background: "var(--app-accent-bg)" }}
      >
        <MarkdownContent content={content} />
      </div>
    </div>
  );
}

export function MessageList({ messages, streamingMessage, avatarOf }: MessageListProps) {
  return (
    <>
      {messages.map((msg) => (
        <div key={msg.id} className="animate-pageIn">
          {msg.role === "user" ? (
            <UserTurn content={msg.content} />
          ) : (
            <AssistantTurn
              agentName={msg.agentName}
              avatar={avatarOf?.(msg.agentName)}
              timeline={msg.timeline as PhaseCard[] | undefined}
              content={msg.content}
            />
          )}
        </div>
      ))}
      {streamingMessage}
    </>
  );
}
