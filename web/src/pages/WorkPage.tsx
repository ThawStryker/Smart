import { useState, useEffect, useRef } from "react";
import { client } from "@/lib/edgespark";

interface ChatMessage { id: string; role: "user" | "assistant"; content: string; isLoading?: boolean; }
interface Conv { id: number; title: string; createdAt: string; }
interface WorkAgent { id: number; name: string; role: string; systemPrompt: string; tools: string; skills: string; }

const roleLabels: Record<string, string> = {
  architect: "架构师", developer: "开发者", reviewer: "审查者", designer: "设计师", custom: "自定义",
};
const roleColors: Record<string, string> = {
  architect: "from-indigo-400 to-violet-500", developer: "from-amber-400 to-orange-500",
  reviewer: "from-emerald-400 to-teal-500", designer: "from-rose-400 to-pink-500", custom: "from-sky-400 to-blue-500",
};

export function WorkPage() {
  const [convs, setConvs] = useState<Conv[]>([]);
  const [cid, setCid] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [showConvs, setShowConvs] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  const [agents, setAgents] = useState<WorkAgent[]>([]);
  const [rightTab, setRightTab] = useState<"assistant" | "team">("assistant");
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", role: "custom", systemPrompt: "", tools: "read,write,edit,list,grep", skills: "" });

  const fetchAgents = async () => {
    const r = await client.api.fetch("/api/work/agents");
    setAgents(await r.json());
  };
  useEffect(() => { fetchAgents(); }, []);

  useEffect(() => {
    if (!showConvs) return;
    const handler = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        if (editId) saveEdit(editId);
        else setShowConvs(false);
      }
    };
    setTimeout(() => document.addEventListener("click", handler), 0);
    return () => document.removeEventListener("click", handler);
  }, [showConvs, editId, editTitle]);

  const fetchConvs = async () => {
    const r = await fetch("/api/work/conversations", { credentials: "include" });
    setConvs(await r.json());
  };
  useEffect(() => { fetchConvs(); }, []);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const newChat = async () => {
    if (messages.length === 0) return; // Already empty, don't create duplicate
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
    const r = await fetch(`/api/work/conversations/${id}`, { credentials: "include" });
    const c = await r.json();
    try { setMessages(JSON.parse(c.messagesJson || "[]")); } catch { setMessages([]); }
  };

  const deleteConv = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("删除？")) return;
    await fetch(`/api/work/conversations/${id}`, { method: "DELETE", credentials: "include" });
    if (cid === id) { setCid(null); setMessages([]); }
    fetchConvs();
  };

  const startEdit = (id: number, title: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditId(id);
    setEditTitle(title);
  };

  const saveEdit = async (id: number) => {
    if (!editTitle.trim()) return;
    await fetch(`/api/work/conversations/${id}`, {
      method: "PATCH", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: editTitle.trim() }),
    });
    setEditId(null);
    setShowConvs(false);
    fetchConvs();
  };

  const saveMsg = async (c: number, msgs: ChatMessage[]) => {
    const title = msgs.find(m => m.role === "user")?.content.slice(0, 30) || "新对话";
    await fetch(`/api/work/conversations/${c}`, {
      method: "PATCH", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, messagesJson: JSON.stringify(msgs.slice(-50)) }),
    }).catch(() => {});
    fetchConvs(); // Refresh titles in dropdown
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
      {/* Left: Chat — refined editorial aesthetic */}
      <div className="w-[400px] flex flex-col shrink-0 border-r border-[#e8e3d7] relative" style={{ background: "#fbf9f2" }}>
        {/* Paper texture overlay */}
        <div className="absolute inset-0 pointer-events-none opacity-[0.03]" style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E\")" }} />

        {/* Header */}
        <div className="px-4 py-3 border-b border-[#e8e3d7] flex items-center gap-2.5 shrink-0 relative">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center text-white text-[11px] font-bold shrink-0 shadow-sm"
            style={{ background: "linear-gradient(135deg, #e8a850, #c77d30)" }}>S</div>
          <div className="flex-1 relative">
            <button onClick={() => setShowConvs(!showConvs)}
              className="w-full text-left text-[13px] font-medium truncate flex items-center gap-1.5 transition-colors"
              style={{ color: "#4a3728" }}>
              {activeConv?.title || "新对话"}
              <svg className="w-3 h-3 opacity-40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6,9 12,15 18,9"/></svg>
            </button>
            {showConvs && (
              <div ref={dropRef} className="absolute top-full left-0 right-0 mt-1.5 border shadow-xl z-50 max-h-48 overflow-y-auto rounded-xl py-1"
                style={{ background: "#fffdf7", borderColor: "#e0d9c8" }}>
                {convs.filter(c => c.title !== "新对话").map(c => (
                  <div key={c.id} onClick={() => { if (editId !== c.id) selectConv(c.id); }}
                    className={`px-4 py-2.5 text-[13px] cursor-pointer flex items-center justify-between transition-colors ${c.id === cid ? "bg-amber-50/80" : "hover:bg-[#faf6ed]"}`}>
                    {editId === c.id ? (
                      <input autoFocus value={editTitle} onChange={e => setEditTitle(e.target.value)}
                        onBlur={() => saveEdit(c.id)} onKeyDown={e => { if (e.key === "Enter") saveEdit(c.id); if (e.key === "Escape") setEditId(null); }}
                        onClick={e => e.stopPropagation()}
                        className="flex-1 text-[13px] px-2 py-0.5 border rounded-md outline-none bg-white"
                        style={{ borderColor: "#d4a76a" }} />
                    ) : (
                      <span className="truncate flex-1" style={{ color: "#5c4330" }}>{c.title}</span>
                    )}
                    <div className="flex items-center gap-0.5 shrink-0 ml-2">
                      <button onClick={(e) => startEdit(c.id, c.title, e)}
                        className="p-1 rounded transition-colors hover:bg-amber-100/50" style={{ color: "#b8a088" }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      </button>
                      <button onClick={(e) => deleteConv(c.id, e)}
                        className="p-1 rounded transition-colors hover:bg-red-50" style={{ color: "#b8a088" }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3,6 5,6 21,6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                      </button>
                    </div>
                  </div>
                ))}
                {convs.filter(c => c.title !== "新对话").length === 0 && (
                  <p className="text-xs text-center py-4" style={{ color: "#b8a088" }}>暂无对话</p>
                )}
              </div>
            )}
          </div>
          <button onClick={newChat}
            className="text-[11px] font-medium px-2.5 py-1 rounded-lg transition-all shrink-0 hover:bg-amber-100/60"
            style={{ color: "#b87333" }}>+ 新对话</button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-5 space-y-5 relative">
          {messages.map(m => (
            <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              {m.role === "assistant" && (
                <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-[10px] font-semibold shrink-0 mr-2.5 mt-0.5 shadow-sm"
                  style={{ background: "linear-gradient(135deg, #d4a76a, #b87333)" }}>S</div>
              )}
              <div className={`max-w-[82%] px-4 py-3 text-[13.5px] leading-relaxed ${
                m.role === "user"
                  ? "text-white rounded-2xl rounded-br-md shadow-sm"
                  : "rounded-2xl rounded-bl-md"
              }`}
              style={m.role === "user"
                ? { background: "linear-gradient(135deg, #c7853a, #a0622e)" }
                : { background: "#fffdf7", color: "#5c4330", border: "1px solid #e8e0d0" }
              }>
                {m.isLoading ? (
                  <div className="flex items-center gap-2 py-0.5">
                    <span className="w-2 h-2 rounded-full animate-bounce" style={{ background: "#d4c4a8" }} />
                    <span className="w-2 h-2 rounded-full animate-bounce" style={{ background: "#d4c4a8", animationDelay: "150ms" }} />
                    <span className="w-2 h-2 rounded-full animate-bounce" style={{ background: "#d4c4a8", animationDelay: "300ms" }} />
                  </div>
                ) : (
                  <div dangerouslySetInnerHTML={{ __html: m.content.replace(/\n/g, "<br>") }} />
                )}
              </div>
            </div>
          ))}
          {messages.length === 0 && (
            <div className="text-center py-20">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-white text-xl font-bold shadow-md mx-auto mb-4"
                style={{ background: "linear-gradient(135deg, #d4a76a, #b87333)" }}>S</div>
              <p className="text-sm font-medium mb-1" style={{ color: "#4a3728" }}>Smart Work</p>
              <p className="text-xs" style={{ color: "#b8a088" }}>说需求、下命令，我来帮你</p>
            </div>
          )}
          <div ref={endRef} />
        </div>

        {/* Input */}
        <div className="p-3 border-t shrink-0 relative" style={{ borderColor: "#e8e3d7", background: "#fdfaf2" }}>
          <div className="relative">
            <textarea value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              placeholder="输入需求或命令..."
              rows={2} disabled={streaming}
              className="w-full resize-none pl-4 pr-12 py-3 text-[13.5px] leading-relaxed rounded-2xl outline-none transition-all disabled:opacity-40"
              style={{
                background: "#fffdf7",
                border: "1px solid #e0d8c5",
                color: "#4a3728",
              }}
              onFocus={e => { e.target.style.borderColor = "#c7853a"; e.target.style.boxShadow = "0 0 0 3px rgba(199,133,58,0.08)"; }}
              onBlur={e => { e.target.style.borderColor = "#e0d8c5"; e.target.style.boxShadow = "none"; }} />
            <button onClick={handleSend} disabled={streaming || !input.trim()}
              className="absolute right-2 bottom-2 w-9 h-9 rounded-xl text-white flex items-center justify-center shadow-sm transition-all disabled:opacity-25 hover:shadow-md hover:scale-[1.02] active:scale-95"
              style={{ background: "linear-gradient(135deg, #c7853a, #a0622e)" }}>
              <svg width="15" height="15" viewBox="0 0 24 24"><line x1="12" y1="19" x2="12" y2="5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/><polyline points="5,12 12,5 19,12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
          </div>
        </div>
      </div>

      {/* Center: Workspace */}
      <div className="flex-1 flex flex-col min-w-0 bg-white">
        <div className="px-4 py-2.5 border-b border-[#edeae5] font-semibold text-sm text-primary shrink-0">工作区</div>
        <textarea className="flex-1 p-6 text-sm leading-relaxed resize-none outline-none font-mono" placeholder="文档、计划、设计稿..." />
      </div>

      {/* Right: Workspace + Roles */}
      <div className="w-72 flex flex-col shrink-0 border-l relative" style={{ background: "#fbf9f2", borderColor: "#e8e3d7" }}>
        {/* Workspace */}
        <div className="h-1/2 flex flex-col border-b" style={{ borderColor: "#e8e3d7" }}>
          <div className="px-4 py-2.5 font-semibold text-[13px] shrink-0 flex items-center justify-between" style={{ color: "#4a3728" }}>
            <span>Workspace</span>
            <span className="text-[10px] font-normal opacity-40">3 文件</span>
          </div>
          <div className="flex-1 overflow-y-auto px-2 pb-2">
            {[
              { name: "需求文档.md", type: "md", date: "今天" },
              { name: "API 设计.md", type: "md", date: "昨天" },
              { name: "设计系统.md", type: "md", date: "2天前" },
            ].map(f => (
              <div key={f.name} className="flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors hover:bg-white/60 text-xs group">
                <span className="text-base shrink-0">📄</span>
                <div className="flex-1 min-w-0">
                  <div className="truncate font-medium" style={{ color: "#4a3728" }}>{f.name}</div>
                  <div className="text-[10px] opacity-40">{f.date}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Roles */}
        <div className="h-1/2 flex flex-col">
          <div className="flex border-b shrink-0" style={{ borderColor: "#e8e3d7" }}>
            {(["assistant", "team"] as const).map(t => (
              <button key={t} onClick={() => setRightTab(t)}
                className={`flex-1 py-2 text-xs font-medium transition-colors relative ${
                  rightTab === t ? "" : "opacity-40 hover:opacity-70"
                }`}
                style={{ color: "#5c4330" }}>
                {{ assistant: "助理", team: "团队" }[t]}
                {rightTab === t && <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full" style={{ background: "#c7853a" }} />}
              </button>
            ))}
          </div>
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Create button */}
            <div className="px-3 py-2">
              <button onClick={() => setShowCreate(!showCreate)}
                className="w-full py-1.5 text-[11px] font-medium rounded-lg transition-colors hover:bg-amber-100/40"
                style={{ color: "#b87333", border: "1px dashed #d4c4a8" }}>
                + 创建{rightTab === "assistant" ? "助理" : "伙伴"}
              </button>
            </div>
            {showCreate && (
              <div className="px-3 pb-2 space-y-1.5">
                <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  placeholder="名称" className="w-full px-2 py-1.5 text-[11px] rounded-lg outline-none border"
                  style={{ background: "#fffdf7", borderColor: "#e0d8c5", color: "#4a3728" }} />
                <select value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value }))}
                  className="w-full px-2 py-1.5 text-[11px] rounded-lg outline-none border"
                  style={{ background: "#fffdf7", borderColor: "#e0d8c5", color: "#4a3728" }}>
                  {Object.entries(roleLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <textarea value={form.systemPrompt} onChange={e => setForm(p => ({ ...p, systemPrompt: e.target.value }))}
                  placeholder="系统提示" rows={2}
                  className="w-full px-2 py-1.5 text-[11px] rounded-lg outline-none border resize-none"
                  style={{ background: "#fffdf7", borderColor: "#e0d8c5", color: "#4a3728" }} />
                <div className="flex gap-1.5">
                  <button onClick={async () => {
                    if (!form.name.trim()) return;
                    await client.api.fetch("/api/work/agents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
                    setShowCreate(false); setForm({ name: "", role: "custom", systemPrompt: "", tools: "read,write,edit,list,grep", skills: "" });
                    fetchAgents();
                  }} className="flex-1 py-1.5 rounded-lg text-[11px] font-medium text-white transition-colors hover:opacity-90"
                    style={{ background: "linear-gradient(135deg, #c7853a, #a0622e)" }}>创建</button>
                  <button onClick={() => setShowCreate(false)}
                    className="px-3 py-1.5 rounded-lg text-[11px] transition-colors hover:bg-white/60"
                    style={{ color: "#8b7355", border: "1px solid #e0d8c5" }}>取消</button>
                </div>
              </div>
            )}
            {/* Agent list */}
            <div className="flex-1 overflow-y-auto px-2 pb-2">
              {agents.map(a => (
                <div key={a.id} className="flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors hover:bg-white/60 group cursor-pointer">
                  <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${roleColors[a.role] || roleColors.custom} flex items-center justify-center text-white text-[10px] font-bold shrink-0 shadow-sm`}>
                    {a.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate" style={{ color: "#4a3728" }}>{a.name}</div>
                    <div className="text-[10px] opacity-40">{roleLabels[a.role] || a.role}</div>
                  </div>
                  <button onClick={async () => {
                    if (!confirm("删除？")) return;
                    await client.api.fetch(`/api/work/agents/${a.id}`, { method: "DELETE" });
                    fetchAgents();
                  }} className="opacity-0 group-hover:opacity-100 p-1 rounded transition-all hover:bg-red-50"
                    style={{ color: "#b8a088" }}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3,6 5,6 21,6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                  </button>
                </div>
              ))}
              {agents.length === 0 && !showCreate && (
                <p className="text-[11px] text-center py-6 opacity-40">暂无{rightTab === "assistant" ? "助理" : "伙伴"}</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
