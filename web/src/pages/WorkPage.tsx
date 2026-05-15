import { useState, useEffect, useRef } from "react";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  isLoading?: boolean;
}

export function WorkPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || streaming) return;
    const content = input.trim();
    setInput("");
    const uid = `u-${Date.now()}`;
    const aid = `a-${Date.now()}`;
    setMessages(prev => [...prev, { id: uid, role: "user", content }, { id: aid, role: "assistant", content: "", isLoading: true }]);
    setStreaming(true);

    try {
      const res = await fetch("/api/work/chat", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: content, model: "seed-pro", systemPrompt: "你是 Smart Work 的主 Agent，帮助用户分析需求、布置任务、整理工作。用简洁的语言回复。" }),
      });
      if (!res.ok || !res.body) throw new Error(`API ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "", full = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() || "";
        for (const line of lines) {
          const d = line.trim();
          if (!d.startsWith("data:")) continue;
          try {
            const data = JSON.parse(d.slice(5).trim());
            if (data.type === "text") {
              full += data.content;
              setMessages(prev => prev.map(m => m.id === aid ? { ...m, content: full, isLoading: false } : m));
            } else if (data.type === "error") {
              full = `错误: ${data.content}`;
              setMessages(prev => prev.map(m => m.id === aid ? { ...m, content: full, isLoading: false } : m));
            }
          } catch {}
        }
      }
      if (!full) setMessages(prev => prev.map(m => m.id === aid ? { ...m, content: "(无响应)", isLoading: false } : m));
    } catch (err: any) {
      setMessages(prev => prev.map(m => m.id === aid ? { ...m, content: `错误: ${err.message}`, isLoading: false } : m));
    }
    setStreaming(false);
  };

  return (
    <div className="h-full flex bg-[#faf9f7]">
      {/* Left: Chat */}
      <div className="w-[380px] flex flex-col shrink-0 bg-white border-r border-[#edeae5]">
        <div className="px-4 py-2.5 border-b border-[#edeae5] flex items-center gap-2 shrink-0">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white text-[10px] font-bold">S</div>
          <span className="font-semibold text-sm text-primary">Smart Work</span>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {messages.map(m => (
            <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              {m.role === "assistant" && <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white text-[10px] font-bold shrink-0 mr-2 mt-0.5">S</div>}
              <div className={`max-w-[85%] px-3.5 py-2.5 rounded-2xl text-[13px] leading-relaxed ${m.role === "user" ? "bg-gradient-to-br from-amber-400 to-orange-500 text-white rounded-br-md" : "bg-[#f5f2ed] text-secondary rounded-bl-md"}`}>
                {m.isLoading ? (
                  <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#d4cfc7] animate-bounce" /><span className="w-2 h-2 rounded-full bg-[#d4cfc7] animate-bounce" style={{ animationDelay: "150ms" }} /><span className="w-2 h-2 rounded-full bg-[#d4cfc7] animate-bounce" style={{ animationDelay: "300ms" }} /></div>
                ) : (
                  <div dangerouslySetInnerHTML={{ __html: m.content.replace(/\n/g, "<br>") }} />
                )}
              </div>
            </div>
          ))}
          {messages.length === 0 && <p className="text-xs text-tertiary text-center py-16">和 AI 对话，说需求、下命令</p>}
          <div ref={endRef} />
        </div>
        <div className="p-3 border-t border-[#edeae5] shrink-0 bg-[#faf9f7]">
          <div className="relative">
            <textarea value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              placeholder="输入需求或命令... (Enter 发送)" rows={2} disabled={streaming}
              className="w-full resize-none input-field pl-4 pr-12 py-3 text-[13px] leading-relaxed rounded-xl bg-white disabled:opacity-50" />
            <button onClick={handleSend} disabled={streaming || !input.trim()}
              className="absolute right-2 bottom-2 w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 text-white flex items-center justify-center shadow-sm disabled:opacity-30">
              <svg width="14" height="14" viewBox="0 0 24 24"><line x1="12" y1="19" x2="12" y2="5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/><polyline points="5,12 12,5 19,12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
          </div>
        </div>
      </div>

      {/* Center: Workspace */}
      <div className="flex-1 flex flex-col min-w-0 bg-white">
        <div className="px-4 py-2.5 border-b border-[#edeae5] font-semibold text-sm text-primary shrink-0">工作区</div>
        <textarea className="flex-1 p-6 text-sm leading-relaxed resize-none outline-none font-mono" placeholder="文档、计划、设计稿..." />
      </div>

      {/* Right: Agents placeholder */}
      <div className="w-64 flex flex-col shrink-0 bg-white border-l border-[#edeae5]">
        <div className="px-4 py-2.5 border-b border-[#edeae5] font-semibold text-sm text-primary">角色管理</div>
        <div className="flex-1" />
      </div>
    </div>
  );
}
