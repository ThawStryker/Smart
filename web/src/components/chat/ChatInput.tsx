import { useState, useRef } from "react";

export function ChatInput() {
  const [message, setMessage] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = () => {
    if (!message.trim()) return;
    console.log("Send:", message);
    setMessage("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="bg-white border-t border-neutral-200 p-4">
      <div className="border border-neutral-300 rounded-lg overflow-hidden">
        <div className="px-4 py-2 border-b border-neutral-200 bg-neutral-50 flex items-center gap-2">
          <span className="text-neutral-500 text-sm">⚡</span>
          <span className="text-xs text-neutral-500">内置能力</span>
        </div>
        <textarea
          ref={textareaRef}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="继续对话，描述你需要的工具修改要求..."
          className="w-full px-4 py-3 text-sm outline-none resize-none h-20"
        />
        <div className="px-4 py-2 flex items-center justify-between border-t border-neutral-200 bg-neutral-50">
          <div className="flex items-center gap-4">
            {["附件", "MCP", "Skills"].map((label) => (
              <button
                key={label}
                className="flex items-center gap-1.5 text-xs text-neutral-600 hover:text-blue-600 transition-colors"
              >
                {label === "附件" && "📎"}
                {label === "MCP" && "🧩"}
                {label === "Skills" && "✨"}
                {label}
              </button>
            ))}
            <button className="flex items-center gap-1.5 text-xs bg-blue-50 text-blue-600 px-3 py-1 rounded hover:bg-blue-100 transition-colors">
              + 创建工具
            </button>
          </div>
          <button
            onClick={handleSend}
            disabled={!message.trim()}
            className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            ➤
          </button>
        </div>
      </div>
    </div>
  );
}
