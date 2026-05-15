import { useState, useEffect, useRef } from "react";
import { client } from "@/lib/edgespark";

interface WorkAgent {
  id: number;
  name: string;
  role: string;
  systemPrompt: string;
  tools: string;
  skills: string;
}

interface WorkConv {
  id: number;
  title: string;
  createdAt: string;
  updatedAt: string;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  isLoading?: boolean;
}

const roleLabels: Record<string, string> = {
  architect: "架构师", developer: "开发者", reviewer: "审查者", designer: "设计师", custom: "自定义",
};
const roleColors: Record<string, string> = {
  architect: "from-indigo-400 to-violet-500", developer: "from-amber-400 to-orange-500",
  reviewer: "from-emerald-400 to-teal-500", designer: "from-rose-400 to-pink-500",
  custom: "from-sky-400 to-blue-500",
};

export function WorkPage() {
  const [agents, setAgents] = useState<WorkAgent[]>([]);
  const [convs, setConvs] = useState<WorkConv[]>([]);
  const [activeConvId, setActiveConvId] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showConvMenu, setShowConvMenu] = useState(false);
  const [form, setForm] = useState({ name: "", role: "custom", systemPrompt: "", tools: "read,write,edit,list,grep", skills: "" });
  const [isStreaming, setIsStreaming] = useState(false);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  const [rightTab, setRightTab] = useState<"me" | "partners">("me");
  const [workspace, setWorkspace] = useState("# 工作区\n\n在此编辑文档、计划、设计稿...\n");
  const [wsTab, setWsTab] = useState<"edit" | "preview">("edit");

  const fetchAgents = async () => {
    const res = await client.api.fetch("/api/work/agents");
    setAgents(await res.json());
  };
  const fetchConvs = async () => {
    const res = await client.api.fetch("/api/work/conversations");
    setConvs(await res.json());
  };

  useEffect(() => { fetchAgents(); fetchConvs(); }, []);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const handleNewChat = async () => {
    const res = await client.api.fetch("/api/work/conversations", { method: "POST" });
    const conv = await res.json();
    setConvs(prev => [conv, ...prev]);
    setActiveConvId(conv.id);
    setMessages([]);
    setShowConvMenu(false);
  };

  const handleSelectConv = async (id: number) => {
    setActiveConvId(id);
    setShowConvMenu(false);
    const res = await client.api.fetch(`/api/work/conversations/${id}`);
    const conv = await res.json();
    try {
      setMessages(JSON.parse(conv.messagesJson || "[]"));
    } catch { setMessages([]); }
  };

  const handleDeleteConv = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("确定删除？")) return;
    await client.api.fetch(`/api/work/conversations/${id}`, { method: "DELETE" });
    setConvs(prev => prev.filter(c => c.id !== id));
    if (activeConvId === id) { setActiveConvId(null); setMessages([]); }
  };

  const saveMessages = async (convId: number, msgs: ChatMessage[]) => {
    const json = JSON.stringify(msgs.slice(-50));
    const title = msgs.find(m => m.role === "user")?.content.slice(0, 30) || "新对话";
    client.api.fetch(`/api/work/conversations/${convId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, messagesJson: json }),
    }).catch(() => {});
  };

  const handleCreateAgent = async () => {
    if (!form.name.trim()) return;
    await client.api.fetch("/api/work/agents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    setShowCreate(false);
    setForm({ name: "", role: "custom", systemPrompt: "", tools: "read,write,edit,list,grep", skills: "" });
    fetchAgents();
  };
  const handleDeleteAgent = async (id: number) => {
    if (!confirm("确定删除？")) return;
    await client.api.fetch(`/api/work/agents/${id}`, { method: "DELETE" });
    fetchAgents();
  };

  const streamChat = async (message: string, systemPrompt: string, abortController: AbortController) => {
    const res = await fetch("/api/work/chat", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, model: "seed", systemPrompt }),
      signal: abortController.signal,
    });
    if (!res.ok || !res.body) throw new Error(`API ${res.status}`);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "", fullText = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        try {
          const data = JSON.parse(line.slice(6));
          if (data.type === "text") fullText += data.content;
          if (data.type === "error") fullText = `错误: ${data.content}`;
        } catch {}
      }
    }
    return fullText;
  };

  const handleSend = async () => {
    if (!input.trim() || isStreaming) return;
    const content = input.trim();
    setInput("");

    let convId = activeConvId;
    if (!convId) {
      const res = await client.api.fetch("/api/work/conversations", { method: "POST" });
      const conv = await res.json();
      convId = conv.id;
      setConvs(prev => [conv, ...prev]);
      setActiveConvId(convId);
    }

    const uid = `u-${Date.now()}`;
    const aid = `a-${Date.now()}`;
    const newMsgs: ChatMessage[] = [...messages, { id: uid, role: "user" as const, content }, { id: aid, role: "assistant" as const, content: "", isLoading: true }];
    setMessages(newMsgs);
    setIsStreaming(true);

    try {
      const sysPrompt = "你是 Smart Work 中的主 Agent，帮助用户分析需求、布置任务、整理工作。当你需要输出文档或计划时，用 Markdown 格式。用简洁的语言回复。";
      const fullText = await streamChat(content, sysPrompt, new AbortController());
      const finalMsgs = newMsgs.map(m => m.id === aid ? { ...m, content: fullText || "无响应" } : m) as ChatMessage[];
      setMessages(finalMsgs);
      saveMessages(convId!, finalMsgs);
    } catch (err: any) {
      if (err.name !== "AbortError") {
        const errMsgs = newMsgs.map(m => m.id === aid ? { ...m, content: `错误: ${err.message}`, isLoading: false } : m) as ChatMessage[];
        setMessages(errMsgs);
      }
    }
    setIsStreaming(false);
  };

  const ChatBubble = ({ m }: { m: ChatMessage }) => (
    <div className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
      {m.role === "assistant" && (
        <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white text-[10px] font-bold shrink-0 mr-2 mt-0.5">S</div>
      )}
      <div className={`max-w-[85%] px-3.5 py-2.5 rounded-2xl text-[13px] leading-relaxed ${
        m.role === "user"
          ? "bg-gradient-to-br from-amber-400 to-orange-500 text-white rounded-br-md"
          : "bg-[#f5f2ed] text-secondary rounded-bl-md"
      }`}>
        {m.isLoading ? (
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#d4cfc7] animate-bounce" style={{ animationDelay: "0ms" }} />
            <span className="w-2 h-2 rounded-full bg-[#d4cfc7] animate-bounce" style={{ animationDelay: "150ms" }} />
            <span className="w-2 h-2 rounded-full bg-[#d4cfc7] animate-bounce" style={{ animationDelay: "300ms" }} />
          </div>
        ) : (
          <div dangerouslySetInnerHTML={{ __html: m.content.replace(/\n/g, "<br>") }} />
        )}
      </div>
    </div>
  );

  const activeConv = convs.find(c => c.id === activeConvId);

  return (
    <div className="h-full flex bg-[#faf9f7]">
      {/* === LEFT: Chat === */}
      <div className="w-[380px] flex flex-col shrink-0 bg-white border-r border-[#edeae5]">
        <div className="px-4 py-2.5 border-b border-[#edeae5] flex items-center gap-2 shrink-0">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white text-[10px] font-bold shadow-sm shrink-0">S</div>
          <div className="flex-1 min-w-0 relative">
            <button onClick={() => setShowConvMenu(!showConvMenu)}
              className="w-full text-left text-xs font-medium text-primary truncate hover:text-amber-600 transition-colors flex items-center gap-1">
              {activeConv?.title || "新对话"}
              <svg className="w-3 h-3 text-tertiary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6,9 12,15 18,9"/></svg>
            </button>
            {showConvMenu && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-[#edeae5] rounded-xl shadow-lg z-50 max-h-52 overflow-y-auto">
                {convs.map(c => (
                  <div key={c.id} onClick={() => handleSelectConv(c.id)}
                    className={`px-3 py-2 text-xs cursor-pointer hover:bg-[#faf9f7] flex items-center justify-between ${c.id === activeConvId ? "bg-amber-50" : ""}`}>
                    <span className="truncate flex-1">{c.title}</span>
                    <button onClick={(e) => handleDeleteConv(c.id, e)}
                      className="text-[10px] text-tertiary hover:text-red-500 ml-2 shrink-0">✕</button>
                  </div>
                ))}
                {convs.length === 0 && <p className="text-[10px] text-tertiary p-3 text-center">暂无对话</p>}
              </div>
            )}
          </div>
          <button onClick={handleNewChat}
            className="text-[10px] text-amber-600 hover:bg-amber-50 px-2 py-1 rounded-md transition-colors font-medium shrink-0">+ 新对话</button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {messages.map(m => <ChatBubble key={m.id} m={m} />)}
          {messages.length === 0 && (
            <div className="text-center py-16">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white text-lg font-bold shadow-md mx-auto mb-3">S</div>
              <p className="text-sm text-secondary font-medium mb-1">Smart Work</p>
              <p className="text-xs text-tertiary">说需求、下命令，我来帮你</p>
            </div>
          )}
          <div ref={endRef} />
        </div>
        <div className="p-3 border-t border-[#edeae5] shrink-0 bg-[#faf9f7]">
          <div className="relative">
            <textarea value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              placeholder="输入需求或命令... (Enter 发送，Shift+Enter 换行)"
              rows={2} disabled={isStreaming}
              className="w-full resize-none input-field pl-4 pr-12 py-3 text-[13px] leading-relaxed rounded-xl bg-white disabled:opacity-50" />
            <button onClick={handleSend} disabled={isStreaming || !input.trim()}
              className="absolute right-2 bottom-2 w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 text-white flex items-center justify-center shadow-sm hover:shadow-md hover:shadow-amber-100 transition-all disabled:opacity-30 disabled:cursor-not-allowed">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5,12 12,5 19,12"/></svg>
            </button>
          </div>
        </div>
      </div>

      {/* === CENTER: Workspace === */}
      <div className="flex-1 flex flex-col min-w-0 bg-white">
        <div className="px-4 py-3 border-b border-[#edeae5] flex items-center justify-between shrink-0">
          <span className="font-semibold text-sm text-primary">工作区</span>
          <div className="flex gap-1">
            {(["edit", "preview"] as const).map(t => (
              <button key={t} onClick={() => setWsTab(t)}
                className={`px-3 py-1 text-xs rounded transition-colors ${wsTab === t ? "bg-amber-100 text-amber-700 font-medium" : "text-tertiary hover:bg-[#f5f2ed]"}`}>
                {{ edit: "编辑", preview: "预览" }[t]}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-hidden">
          {wsTab === "edit" ? (
            <textarea value={workspace} onChange={e => setWorkspace(e.target.value)}
              className="w-full h-full p-6 text-sm leading-relaxed resize-none outline-none font-mono"
              placeholder="工作区 — 文档、计划、设计稿..." />
          ) : (
            <div className="p-6 text-sm leading-relaxed prose prose-sm max-w-none h-full overflow-y-auto"
              dangerouslySetInnerHTML={{ __html: workspace.replace(/\n/g, "<br>").replace(/## (.+)/g, "<h2 class='text-lg font-bold mt-4 mb-2'>$1</h2>").replace(/- (.+)/g, "<li class='ml-4'>$1</li>") }} />
          )}
        </div>
      </div>

      {/* === RIGHT: Role Management === */}
      <div className="w-72 flex flex-col shrink-0 bg-white border-l border-[#edeae5]">
        <div className="flex border-b border-[#edeae5]">
          {(["me", "partners"] as const).map(t => (
            <button key={t} onClick={() => setRightTab(t)}
              className={`flex-1 py-2.5 text-xs font-medium transition-colors ${rightTab === t ? "text-amber-600 border-b-2 border-amber-500" : "text-tertiary hover:text-secondary"}`}>
              {{ me: "我", partners: "伙伴" }[t]}
            </button>
          ))}
        </div>
        {rightTab === "me" ? (
          <div className="flex-1 overflow-y-auto">
            <div className="p-3 border-b border-[#edeae5]">
              <div className="flex items-center gap-2.5 mb-3">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white text-sm font-bold shadow-sm">我</div>
                <div><div className="text-sm font-semibold text-primary">我的 Agent</div><div className="text-[11px] text-tertiary">主 Agent</div></div>
              </div>
            </div>
            <div className="p-3 border-b border-[#edeae5]">
              <p className="text-xs font-semibold text-secondary mb-2">Memory</p>
              {["偏好简洁回复", "常用 React + TypeScript", "喜欢渐进式开发"].map((m, i) => (
                <div key={i} className="text-[11px] text-tertiary bg-[#faf9f7] px-2 py-1 rounded mb-1">• {m}</div>
              ))}
            </div>
            <div className="p-3 border-b border-[#edeae5]">
              <p className="text-xs font-semibold text-secondary mb-2">Skills</p>
              {["需求分析", "方案设计", "代码审查"].map((s, i) => (
                <div key={i} className="text-[11px] text-tertiary bg-[#faf9f7] px-2 py-1 rounded mb-1 flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-amber-400" />{s}</div>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="p-2 border-b border-[#edeae5]">
              <button onClick={() => setShowCreate(!showCreate)}
                className="w-full py-1.5 text-xs text-amber-600 hover:bg-amber-50 rounded-lg transition-colors font-medium">+ 创建合作伙伴</button>
            </div>
            {showCreate && (
              <div className="p-2 border-b border-[#edeae5] space-y-1.5 bg-[#faf9f7]">
                <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="角色名称" className="w-full input-field px-2 py-1 text-[11px]" />
                <select value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value }))} className="w-full input-field px-2 py-1 text-[11px]">
                  {Object.entries(roleLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <textarea value={form.systemPrompt} onChange={e => setForm(p => ({ ...p, systemPrompt: e.target.value }))} placeholder="系统提示" rows={2} className="w-full input-field px-2 py-1 text-[11px]" />
                <button onClick={handleCreateAgent} className="w-full py-1 bg-amber-500 text-white rounded text-[11px] font-medium hover:bg-amber-600 transition-colors">创建</button>
              </div>
            )}
            <div className="flex-1 overflow-y-auto">
              {agents.map(a => (
                <div key={a.id} className="px-3 py-2.5 border-b border-[#edeae5] hover:bg-[#faf9f7] transition-colors">
                  <div className="flex items-center gap-2.5 mb-1.5">
                    <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${roleColors[a.role] || roleColors.custom} flex items-center justify-center text-white text-[10px] font-bold shrink-0`}>{a.name.charAt(0).toUpperCase()}</div>
                    <div className="flex-1 min-w-0"><div className="text-xs font-medium text-primary truncate">{a.name}</div><div className="text-[10px] text-tertiary">{roleLabels[a.role] || a.role}</div></div>
                    <button onClick={() => handleDeleteAgent(a.id)} className="text-[10px] text-tertiary hover:text-red-500 shrink-0">删除</button>
                  </div>
                  <div className="text-[10px] text-tertiary line-clamp-2">{a.systemPrompt || "无系统提示"}</div>
                  <div className="flex gap-1 flex-wrap mt-1">{a.tools.split(",").slice(0, 3).map((t, i) => (<span key={i} className="text-[9px] px-1.5 py-0.5 bg-[#edeae5] text-tertiary rounded">{t.trim()}</span>))}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
