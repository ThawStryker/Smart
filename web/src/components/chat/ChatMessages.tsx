import { useRef, useEffect } from "react";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  images?: string[];
  isLoading?: boolean;
  thinking?: string;
  toolCalls?: Array<{ name: string; status: string }>;
}

interface ChatMessagesProps {
  messages: ChatMessage[];
}

function MessageContent({ content }: { content: string }) {
  const html = content
    .replace(/```(\w+)?\n([\s\S]*?)```/g, (_: string, lang: string, code: string) =>
      `<pre class="bg-[#f5f2ed] rounded-lg p-4 my-3 overflow-x-auto text-[13px] leading-relaxed"><code>${escapeHtml(code.trim())}</code></pre>`
    )
    .replace(/`([^`]+)`/g, (_: string, code: string) =>
      `<code class="bg-[#f5f2ed] text-[#d97706] px-1.5 py-0.5 rounded text-[13px]">${escapeHtml(code)}</code>`
    )
    .replace(/\n/g, "<br>");

  return <div className="text-[14px] leading-relaxed text-secondary" dangerouslySetInnerHTML={{ __html: html }} />;
}

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function ChatMessages({ messages }: ChatMessagesProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5 bg-[#faf9f7]">
      {messages.map((msg) => (
        <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
          <div className={`max-w-[85%] ${msg.role === "user" ? "chat-bubble-user px-4 py-3" : "px-1 py-2"}`}>
            {msg.images && msg.images.length > 0 && (
              <div className="flex gap-2 mb-3 flex-wrap">
                {msg.images.map((img, i) => (
                  <img key={i} src={img} alt="" className="w-16 h-16 rounded-lg object-cover border border-[#edeae5]" />
                ))}
              </div>
            )}

            {msg.thinking && (
              <details className="mb-3">
                <summary className="text-xs text-tertiary cursor-pointer hover:text-secondary transition-colors">思考过程</summary>
                <div className="mt-2 p-3 bg-[#f5f2ed] rounded-lg text-xs text-tertiary whitespace-pre-wrap leading-relaxed">{msg.thinking}</div>
              </details>
            )}

            {msg.toolCalls && msg.toolCalls.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-3">
                {msg.toolCalls.map((tc, i) => (
                  <span key={i} className={`text-[11px] px-2 py-0.5 rounded-full ${
                    tc.status === "running" ? "bg-amber-100 text-amber-700 animate-pulse" : "bg-[#edeae5] text-secondary"
                  }`}>
                    {tc.name}
                  </span>
                ))}
              </div>
            )}

            {msg.content ? (
              <MessageContent content={msg.content} />
            ) : msg.isLoading ? (
              <div className="flex items-center gap-1.5 text-tertiary">
                <span className="w-2 h-2 rounded-full bg-[#d4cfc7] animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-2 h-2 rounded-full bg-[#d4cfc7] animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-2 h-2 rounded-full bg-[#d4cfc7] animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            ) : null}
          </div>
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
