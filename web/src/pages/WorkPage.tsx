import { useState, useEffect, useRef } from "react";
import { client } from "@/lib/edgespark";
import { useWorkFiles } from "@/hooks/useWorkFiles";
import { Crepe } from "@milkdown/crepe";
import { Milkdown, MilkdownProvider, useEditor } from "@milkdown/react";
import { TaskCard, type TaskCardData } from "@/components/work/TaskCard";
import "@/milkdown.css";

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

function MilkdownEditor({ filePath, defaultValue, onChange }: {
  filePath: string;
  defaultValue: string;
  onChange: (md: string) => void;
}) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const crepeRef = useRef<Crepe | null>(null);

  useEditor((root) => {
    root.classList.add("milkdown");
    const crepe = new Crepe({
      root,
      defaultValue: defaultValue || "# ",
      features: {
        [Crepe.Feature.TopBar]: false,
        [Crepe.Feature.CodeMirror]: false,
        [Crepe.Feature.Cursor]: false,
        [Crepe.Feature.Latex]: false,
        [Crepe.Feature.AI]: false,
      },
    });
    crepeRef.current = crepe;
    return crepe;
  });

  useEffect(() => {
    return () => {
      if (crepeRef.current) {
        try {
          const md = crepeRef.current.getMarkdown();
          if (md && md.trim()) onChangeRef.current(md);
        } catch {}
      }
      crepeRef.current = null;
    };
  }, [filePath]);

  useEffect(() => {
    if (!onChange) return;
    const interval = setInterval(() => {
      if (crepeRef.current) {
        try {
          const md = crepeRef.current.getMarkdown();
          if (md) onChange(md);
        } catch {}
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [filePath]);

  return <Milkdown />;
}

interface FileNode { name: string; type: "file" | "folder"; children?: FileNode[]; expanded?: boolean; }

function buildTreeFromPaths(paths: string[]): FileNode[] {
  const root: Record<string, any> = {};
  for (const p of paths) {
    const parts = p.split("/");
    let node = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (i === parts.length - 1) {
        node[part] = node[part] || { name: part, type: "file" as const };
      } else {
        node[part] = node[part] || { name: part, type: "folder" as const, children: {} };
        node = node[part].children;
      }
    }
  }
  function toArray(obj: Record<string, any>): FileNode[] {
    return Object.values(obj).map((n: any) => ({
      ...n,
      children: n.children ? toArray(n.children) : undefined,
      expanded: n.type === "folder" ? true : undefined,
    }));
  }
  return toArray(root);
}

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
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [taskCards, setTaskCards] = useState<Map<string, TaskCardData>>(new Map());
  const [form, setForm] = useState({ name: "", role: "custom", systemPrompt: "", tools: "read,write,edit,list,grep", skills: "" });

  // File tree state
  const [fileTree, setFileTree] = useState<FileNode[]>([
    { name: "System", type: "folder", expanded: true, children: [
      { name: "heartbeat", type: "folder", expanded: false, children: [] },
      { name: "memory", type: "folder", expanded: false, children: [] },
      { name: "skill", type: "folder", expanded: false, children: [] },
    ]},
    { name: "Context", type: "folder", expanded: false, children: [] },
    { name: "AGENTS.md", type: "file" },
  ]);
  const [contextMenu, setContextMenu] = useState<{ path: number[]; x: number; y: number } | null>(null);
  const [addingTo, setAddingTo] = useState<number[] | null>(null);
  const [newItemName, setNewItemName] = useState("");
  const [newItemType, setNewItemType] = useState<"file" | "folder">("file");
  const [renaming, setRenaming] = useState<{ path: number[]; name: string } | null>(null);
  const [selectedFile, setSelectedFile] = useState<{ displayPath: string; treePath?: number[] } | null>(null);
  const [fileContents, setFileContents] = useState<Record<string, string>>({});

  const { files: apiFiles, loading: filesLoading, fetchFiles, readFile, writeFile, deleteFile: deleteApiFile } = useWorkFiles();

  // Build tree from flat file list
  useEffect(() => {
    const nonFolderFiles = apiFiles.filter(f => !f.isFolder);
    if (nonFolderFiles.length === 0) return;
    const tree = buildTreeFromPaths(nonFolderFiles.map(f => f.path));
    setFileTree(tree);
  }, [apiFiles]);

  // Seed default file tree on first load
  useEffect(() => {
    if (!filesLoading && apiFiles.length === 0) {
      const defaults = [
        { path: "AGENTS.md", content: "# Work Agent\n\n你是 Smart Work 的主 Agent。", isFolder: false },
        { path: "System/heartbeat", content: "", isFolder: true },
        { path: "System/memory", content: "", isFolder: true },
        { path: "System/skill", content: "", isFolder: true },
        { path: "Context", content: "", isFolder: true },
      ];
      Promise.all(defaults.map(d => writeFile(d.path, d.content, d.isFolder)))
        .then(() => fetchFiles());
    }
  }, [filesLoading, apiFiles.length]);

  const getFilePath = (treePath: number[]): string => {
    const parts: string[] = [];
    let node: any = fileTree;
    for (let i = 0; i < treePath.length; i++) {
      const n = node[treePath[i]];
      parts.push(n.name);
      node = n.children;
    }
    return parts.join("/");
  };

  const openFile = async (displayPath: string, treePath?: number[]) => {
    const content = await readFile(displayPath);
    setFileContents(prev => ({ ...prev, [displayPath]: content || "" }));
    setSelectedFile({ displayPath, treePath });
  };

  // Close context menu on any click outside
  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [contextMenu]);

  const nodeAt = (path: number[]): FileNode => {
    let node: any = fileTree;
    for (let i = 0; i < path.length; i++) node = node[path[i]].children || node;
    return node;
  };

  const updateTree = (fn: (tree: FileNode[]) => FileNode[]) => {
    setFileTree(prev => fn(JSON.parse(JSON.stringify(prev))));
  };

  const toggleFolder = (path: number[]) => {
    updateTree(tree => {
      let node: any = tree;
      for (let i = 0; i < path.length - 1; i++) node = node[path[i]].children;
      node[path[path.length - 1]].expanded = !node[path[path.length - 1]].expanded;
      return tree;
    });
  };

  const menuAdd = (parentPath: number[], type: "file" | "folder") => {
    setContextMenu(null);
    setNewItemType(type);
    setNewItemName("");
    setAddingTo(parentPath);
  };

  const menuRename = (path: number[], name: string) => {
    setContextMenu(null);
    setRenaming({ path, name });
  };

  const menuDelete = async (path: number[]) => {
    setContextMenu(null);
    const node = nodeAt(path);
    if (!confirm(`删除 ${node.type === "folder" ? "文件夹" : "文件"} "${node.name}"？`)) return;
    const filePath = getFilePath(path);
    await deleteApiFile(filePath);
    await fetchFiles();
  };

  const addItem = async (parentPath: number[]) => {
    if (!newItemName.trim()) return;
    const name = newItemType === "folder"
      ? newItemName
      : (newItemName.endsWith(".md") ? newItemName : newItemName + ".md");

    const parentDir = parentPath.length === 0 ? "" : getFilePath(parentPath) + "/";
    const fullPath = parentDir + name;
    await writeFile(fullPath, "", newItemType === "folder");
    await fetchFiles();
    setAddingTo(null);
    setNewItemName("");
  };

  const commitRename = () => {
    if (!renaming || !renaming.name.trim()) { setRenaming(null); return; }
    updateTree(tree => {
      let node: any = tree;
      for (let i = 0; i < renaming.path.length - 1; i++) node = node[renaming.path[i]].children;
      node[renaming.path[renaming.path.length - 1]].name = renaming.name.trim();
      return tree;
    });
    setRenaming(null);
  };

  const fetchAgents = async () => {
    const r = await client.api.fetch("/api/work/agents");
    setAgents(await r.json());
  };
  useEffect(() => { fetchAgents(); }, []);

  const menuBtn = (path: number[], e: React.MouseEvent) => {
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setContextMenu({ path, x: rect.right, y: rect.bottom + 2 });
  };

  const renderFileTree = (nodes: FileNode[], parentPath: number[] = []): React.ReactNode => (
    <div className="space-y-0.5">
      {nodes.map((node, i) => {
        const path = [...parentPath, i];
        const pathKey = path.join("-");
        const isAdding = addingTo && addingTo.join("-") === pathKey;
        const isRenaming = renaming && renaming.path.join("-") === pathKey;
        const isMenuOpen = contextMenu && contextMenu.path.join("-") === pathKey;
        return (
          <div key={pathKey}>
            {isRenaming ? (
              <div className="flex items-center gap-1 px-2 py-1">
                <span className="text-sm">{node.type === "folder" ? "📁" : "📄"}</span>
                <input autoFocus value={renaming!.name} onChange={e => setRenaming({ path, name: e.target.value })}
                  onKeyDown={e => { if (e.key === "Enter") commitRename(); if (e.key === "Escape") setRenaming(null); }}
                  onBlur={commitRename}
                  className="flex-1 text-[11px] px-2 py-0.5 rounded border outline-none bg-white font-medium"
                  style={{ borderColor: "#d4a76a", color: "#4a3728" }} />
              </div>
            ) : (
              <div className="flex items-center gap-1 px-2 py-1 rounded-md hover:bg-white/60 transition-colors group relative">
                {node.type === "folder" ? (
                  <button onClick={() => toggleFolder(path)} className="p-0.5 transition-transform" style={{ transform: node.expanded ? "rotate(90deg)" : "" }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "#b8a088" }}><polyline points="9,18 15,12 9,6"/></svg>
                  </button>
                ) : (
                  <span className="w-4" />
                )}
                <span className="text-sm">{node.type === "folder" ? (node.expanded ? "📂" : "📁") : "📄"}</span>
                <span className="text-[11px] font-medium flex-1 truncate cursor-pointer hover:text-[#c7853a] transition-colors"
                  style={{ color: "#4a3728" }}
                  onClick={() => { if (node.type === "file") openFile(getFilePath(path), path); else toggleFolder(path); }}>
                  {node.name}{node.type === "folder" ? "/" : ""}
                </span>
                <button onClick={(e) => menuBtn(path, e)}
                  className={`p-0.5 rounded transition-all hover:bg-amber-100/50 ${isMenuOpen ? "opacity-100 bg-amber-100/50" : "opacity-0 group-hover:opacity-100"}`}
                  style={{ color: "#b8a088" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>
                </button>
                {isMenuOpen && (
                  <div className="absolute right-0 top-full mt-0.5 z-50 min-w-[120px] rounded-lg shadow-xl border py-1"
                    style={{ background: "#fffdf7", borderColor: "#e0d9c8" }}
                    onClick={e => e.stopPropagation()}>
                    {node.type === "folder" && (
                      <>
                        <button onClick={() => menuAdd(path, "file")} className="w-full text-left px-3 py-1.5 text-[11px] hover:bg-amber-50/80 transition-colors flex items-center gap-2" style={{ color: "#4a3728" }}>
                          <span className="text-xs">📄</span> 新建文件
                        </button>
                        <button onClick={() => menuAdd(path, "folder")} className="w-full text-left px-3 py-1.5 text-[11px] hover:bg-amber-50/80 transition-colors flex items-center gap-2" style={{ color: "#4a3728" }}>
                          <span className="text-xs">📁</span> 新建文件夹
                        </button>
                        <div className="my-0.5 border-t" style={{ borderColor: "#e8e3d7" }} />
                      </>
                    )}
                    <button onClick={() => menuRename(path, node.name)} className="w-full text-left px-3 py-1.5 text-[11px] hover:bg-amber-50/80 transition-colors flex items-center gap-2" style={{ color: "#4a3728" }}>
                      <span className="text-xs">✏️</span> 重命名
                    </button>
                    <div className="my-0.5 border-t" style={{ borderColor: "#e8e3d7" }} />
                    <button onClick={() => menuDelete(path)} className="w-full text-left px-3 py-1.5 text-[11px] hover:bg-red-50/80 transition-colors flex items-center gap-2" style={{ color: "#c0392b" }}>
                      <span className="text-xs">🗑️</span> 删除
                    </button>
                  </div>
                )}
              </div>
            )}
            {node.type === "folder" && node.expanded && node.children && (
              <div className="ml-4 border-l border-[#e8e3d7] pl-2">
                {renderFileTree(node.children, path)}
              </div>
            )}
            {isAdding && (
              <div className="ml-6 mt-1 flex items-center gap-1.5">
                <span className="text-[10px] opacity-40">{newItemType === "folder" ? "📁" : "📄"}</span>
                <input autoFocus value={newItemName} onChange={e => setNewItemName(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") addItem(path); if (e.key === "Escape") { setAddingTo(null); setNewItemName(""); } }}
                  placeholder={newItemType === "folder" ? "文件夹名" : "文件名"}
                  className="flex-1 text-[10px] px-2 py-0.5 rounded border outline-none bg-white" style={{ borderColor: "#e0d8c5", color: "#4a3728" }} />
                <button onClick={() => addItem(path)}
                  className="text-[10px] px-2 py-0.5 rounded text-white font-medium" style={{ background: "#c7853a" }}>确定</button>
                <button onClick={() => { setAddingTo(null); setNewItemName(""); }}
                  className="text-[10px] px-1.5 py-0.5 rounded" style={{ color: "#8b7355" }}>✕</button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

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
            } else if (data.type === "agent_start") {
              setTaskCards(prev => {
                const next = new Map(prev);
                next.set(data.name, {
                  id: data.name + "_" + Date.now(),
                  name: data.name,
                  task: data.task,
                  status: "running",
                  output: "",
                  files: [],
                });
                return next;
              });
            } else if (data.type === "agent_progress") {
              setTaskCards(prev => {
                const next = new Map(prev);
                const existing = next.get(data.name);
                if (existing) next.set(data.name, { ...existing, output: existing.output + (data.text || "") });
                return next;
              });
            } else if (data.type === "agent_done") {
              setTaskCards(prev => {
                const next = new Map(prev);
                const existing = next.get(data.name);
                if (existing) next.set(data.name, { ...existing, status: "done", files: data.files || [] });
                return next;
              });
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
    <div className="h-full flex bg-[#faf9f7] overflow-x-hidden">
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
          {/* Task cards */}
          {Array.from(taskCards.values()).map(card => (
            <TaskCard key={card.id} card={card}
              onOpenFile={(path) => openFile(`agents/${card.name}/${path}`)} />
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

      {/* Center: Milkdown WYSIWYG Editor */}
      <div className="flex-1 flex flex-col min-w-0 bg-white">
        {selectedFile ? (
          <MilkdownProvider>
            <div className="px-4 py-2.5 border-b border-[#edeae5] flex items-center gap-2 text-[13px] shrink-0" style={{ color: "#4a3728" }}>
              <span className="opacity-40">📄</span>
              <span className="font-medium">{selectedFile.displayPath}</span>
            </div>
            <div className="milkdown-editor-wrapper">
              <MilkdownEditor
                key={selectedFile.displayPath}
                filePath={selectedFile.displayPath}
                defaultValue={fileContents[selectedFile.displayPath] || ""}
                onChange={(md) => setFileContents(prev => ({ ...prev, [selectedFile.displayPath]: md }))}
              />
            </div>
          </MilkdownProvider>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="text-4xl mb-3 opacity-20">📂</div>
              <p className="text-sm font-medium" style={{ color: "#4a3728" }}>选择一个文件</p>
              <p className="text-xs mt-1 opacity-40">从右侧工作空间或助理中选择文件查看</p>
            </div>
          </div>
        )}
      </div>

      {/* Right: Workspace + Roles */}
      {!rightCollapsed ? (
      <div className="w-72 flex flex-col shrink-0 border-l relative" style={{ background: "#fbf9f2", borderColor: "#e8e3d7" }}>
        {/* Workspace */}
        <div className="h-1/2 flex flex-col border-b" style={{ borderColor: "#e8e3d7" }}>
          <div className="px-4 py-2.5 font-semibold text-[13px] shrink-0 flex items-center justify-between" style={{ color: "#4a3728" }}>
            <span>工作空间</span>
            <button onClick={() => setRightCollapsed(true)}
              className="p-1.5 rounded-lg transition-colors hover:bg-black/5" style={{ color: "#b8a088" }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M4 5v14h2V5H4zm7 0L8 8l4 4-4 4 3 3 7-7-7-7z"/></svg>
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-2 pb-2">
            {[
              { name: "需求文档.md", type: "md", date: "今天" },
              { name: "API 设计.md", type: "md", date: "昨天" },
              { name: "设计系统.md", type: "md", date: "2天前" },
            ].map(f => (
              <div key={f.name} onClick={() => openFile(`工作空间/${f.name}`)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors hover:bg-white/60 text-xs group">
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
            {rightTab === "assistant" ? (
              /* 助理 — collapsible file tree */
              <div className="flex-1 overflow-y-auto px-2 py-2">
                {renderFileTree(fileTree)}
              </div>
            ) : (
              /* 团队 — create + agent list */
              <>
                <div className="px-3 py-2">
                  <button onClick={() => setShowCreate(!showCreate)}
                    className="w-full py-1.5 text-[11px] font-medium rounded-lg transition-colors hover:bg-amber-100/40"
                    style={{ color: "#b87333", border: "1px dashed #d4c4a8" }}>
                    + 创建伙伴
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
                    <p className="text-[11px] text-center py-6 opacity-40">暂无伙伴</p>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
      ) : (
        <div className="shrink-0 relative" style={{ width: "20px" }}>
          <button onClick={() => setRightCollapsed(false)}
            className="absolute -left-1 top-1/2 -translate-y-1/2 w-8 h-16 rounded-r-xl flex items-center justify-center transition-all hover:shadow-md hover:bg-amber-100/80 shadow-sm"
            style={{ background: "linear-gradient(135deg, #fdfaf2, #f5efe0)", border: "1.5px solid #d4c4a8", borderLeft: "2px solid #c7853a", color: "#b87333" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15,18 9,12 15,6"/></svg>
          </button>
        </div>
      )}
    </div>
  );
}
