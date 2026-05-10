import { useEffect, useRef, useState } from "react";
import { LoadingDots } from "@/components/shared/LoadingDots";

export interface ChatMessage {
  id?: string;
  role: "user" | "assistant" | "system";
  content: string;
  isLoading?: boolean;
  thinking?: string;
}

interface ChatMessagesProps {
  messages: ChatMessage[];
}

function ThinkingBlock({ content, isLoading }: { content: string; isLoading?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const preview = content.slice(0, 200);
  const hasMore = content.length > 200;

  return (
    <div className="mb-2">
      <div
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-xs text-neutral-400 cursor-pointer hover:text-neutral-500 transition-colors"
      >
        <span>{expanded ? "▼" : "▶"}</span>
        <span>思考中{isLoading ? "..." : ""}</span>
        {!expanded && <span className="truncate max-w-[200px]">{preview}</span>}
      </div>
      {expanded && (
        <div className="mt-1 p-2 bg-neutral-50 rounded border border-neutral-100 text-xs text-neutral-500 whitespace-pre-wrap max-h-40 overflow-y-auto">
          {content}
        </div>
      )}
    </div>
  );
}

export function ChatMessages({ messages }: ChatMessagesProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="flex-1 overflow-y-auto p-4 bg-white space-y-4">
      {messages.length === 0 && (
        <div className="text-sm text-neutral-400 text-center py-12">
          <p>欢迎使用 Smart AI 工具平台！</p>
          <p className="mt-2">在下方的输入框描述你想要的工具，AI 将为你生成代码。</p>
        </div>
      )}
      {messages.map((msg, i) => {
        if (msg.role === "system") {
          return (
            <div key={msg.id || i} className="flex justify-center">
              <div className="text-xs text-neutral-500 bg-neutral-50 border border-neutral-200 rounded px-3 py-1">
                {msg.content}
              </div>
            </div>
          );
        }
        return (
          <div key={msg.id || i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[80%] rounded-lg px-4 py-2 text-sm ${
                msg.role === "user"
                  ? "bg-blue-50 text-neutral-800"
                  : "bg-white border border-neutral-200 text-neutral-700"
              }`}
            >
              {msg.thinking && (
                <ThinkingBlock content={msg.thinking} isLoading={msg.isLoading} />
              )}
              <div className="whitespace-pre-wrap">{msg.content}</div>
              {msg.isLoading && !msg.thinking && (
                <div className="mt-2">
                  <LoadingDots />
                </div>
              )}
            </div>
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
