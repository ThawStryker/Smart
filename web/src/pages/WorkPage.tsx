import { useState, useEffect, useRef } from "react";

interface ChatMessage { id: string; role: "user" | "assistant"; content: string; isLoading?: boolean; }
interface Conv { id: number; title: string; createdAt: string; }

export function WorkPage() {
  const [convs, setConvs] = useState<Conv[]>([]);
  const [cid, setCid] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [showConvs, setShowConvs] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const fetchConvs = async () => {
    const r = await fetch("/api/work/conversations", { credentials: "include" });
    setConvs(await r.json());
  };
  useEffect(() => { fetchConvs(); }, []);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const newChat = async () => {
    const r = await fetch("/api/work/conversations", { method: "POST", credentials: "include" });
    const c = await r.json();
    setConvs(prev => [c, ...prev]);
    setCid(c.id);
    setMessages([]);
    setShowConvs(false);
  };

  const selectConv = async (id: number) => {
    setCid(id);
    setShowConvs(false);
    setMessages([]);
    // Just start fresh - history could be loaded from DB later
  };

  const deleteConv = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("删除？")) return;
    await fetch(`/api/work/conversations/${id}`, { method: "DELETE", credentials: "include" });
    if (cid === id) { setCid(null); setMessages([]); }
    fetchConvs();
  };

  const saveMsg = (c: number, msgs: ChatMessage[]) => {
    const title = msgs.find(m => m.role === "user")?.content.slice(0, 30) || "新对话";
    fetch(`/api/work/conversations/${c}`, {
      method: "PATCH", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, messagesJson: JSON.stringify(msgs.slice(-50)) }),
    }).catch(() => {});
  };

  const activeConv = convs.find(c => c.id === cid);

  const handleSend = async () => {
    if (!input.trim() || streaming) return;
    const content = input.trim();
    setInput("");

    // Auto-create conversation if none active
    let curId = cid;
    if (!curId) {
      const r = await fetch("/api/work/conversations", { method: "POST", credentials: "include" });
      const c = await r.json();
      setConvs(prev => [c, ...prev]);
      setCid(c.id);
      curId = c.id;
    }

    const uid = `u-${Date.now()}`;
    const aid = `a-${Date.now()}`;
    const newMsgs: ChatMessage[] = [...messages, { id: uid, role: "user", content }, { id: aid, role: "assistant", content: "", isLoading: true }];
    setMessages(newMsgs);
    setStreaming(true);

    let full = "";
    try {
      const res = await fetch("/api/work/chat", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: content, model: "seed-pro", systemPrompt: "你是 Smart Work 的主 Agent，帮助用户分析需求、布置任务、整理工作。用简洁的语言回复。" }),
      });
      if (!res.ok || !res.body) throw new Error(`API ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
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

    // Save to conversation
    const saved = [...newMsgs.filter(m => m.id !== aid), { id: aid, role: "assistant" as const, content: full || "(无响应)" }];
    saveMsg(curId!, saved);
  };

  return (
    <div className="h-full flex bg-[#faf9f7]">
      {/* Left: Chat */}
      <div className="w-[380px] flex flex-col shrink-0 bg-white border-r border-[#edeae5]">
        <div className="px-3 py-2 border-b border-[#edeae5] flex items-center gap-2 shrink-0">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white text-[10px] font-bold shrink-0">S</div>
          <div className="flex-1 relative">
            <button onClick={() => setShowConvs(!showConvs)} className="w-full text-left text-xs font-medium text-primary truncate hover:text-amber-600 flex items-center gap-1">
              {activeConv?.title || "新对话"} <svg className="w-3 h-3 text-tertiary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6,9 12,15 18,9"/></svg>
            </button>
            {showConvs && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-[#edeae5] rounded-xl shadow-lg z-50 max-h-48 overflow-y-auto">
                {convs.map(c => (
                  <div key={c.id} onClick={() => selectConv(c.id)} className={`px-3 py-2 text-xs cursor-pointer hover:bg-[#faf9f7] flex items-center justify-between ${c.id === cid ? "bg-amber-50" : ""}`}>
                    <span className="truncate flex-1">{c.title}</span>
                    <button onClick={(e) => deleteConv(c.id, e)} className="text-[10px] text-tertiary hover:text-red-500 ml-2 shrink-0">✕</button>
                  </div>
                ))}
                {convs.length === 0 && <p className="text-[10px] text-tertiary p-3 text-center">暂无对话</p>}
              </div>
            )}
          </div>
          <button onClick={newChat} className="text-[10px] text-amber-600 hover:bg-amber-50 px-2 py-1 rounded-md font-medium shrink-0">+ 新对话</button>
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
