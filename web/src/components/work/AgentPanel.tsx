import React, { useState, useEffect, useCallback } from "react";

interface FileEntry {
  id: number;
  path: string;
  content: string;
  isFolder: number;
}

interface AgentPanelProps {
  sessionId: number;
  onFileSelect: (path: string, content: string) => void;
  selectedFile: string | null;
  onAgentListChange: () => void;
}

const S = {
  bg: "#1d1c19",
  panel: "#252422",
  border: "#2e2d2a",
  text: "#e8e4dd",
  textDim: "#9d9890",
  textMuted: "#6b6660",
  accent: "#f59e0b",
  accentDeep: "#d97706",
  accentBg: "rgba(245,158,11,0.08)",
  accentBorder: "rgba(245,158,11,0.15)",
  hover: "rgba(255,255,255,0.03)",
  activeBg: "rgba(245,158,11,0.1)",
  green: "#4ade80",
  red: "#f87171",
  purple: "#a78bfa",
  blue: "#60a5fa",
};

const agentColors = [S.accent, S.green, S.purple, S.blue, "#fb923c", "#f472b6"];

function getAgentColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  return agentColors[Math.abs(hash) % agentColors.length];
}

export function AgentPanel({ sessionId, onFileSelect, selectedFile, onAgentListChange }: AgentPanelProps) {
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set(["agents", "workspace"]));
  const [showCreateAgent, setShowCreateAgent] = useState(false);
  const [newAgentName, setNewAgentName] = useState("");
  const [newAgentPrompt, setNewAgentPrompt] = useState("");

  const loadFiles = useCallback(async () => {
    const res = await fetch(`/api/work/sessions/${sessionId}/files`);
    if (res.ok) setFiles(await res.json());
  }, [sessionId]);

  useEffect(() => { if (sessionId) loadFiles(); }, [sessionId, loadFiles]);

  const toggleExpand = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path); else next.add(path);
      return next;
    });
  };

  const createAgent = async () => {
    if (!newAgentName.trim()) return;
    const basePath = `agents/${newAgentName.trim()}`;
    for (const sub of ["", "/memory", "/skills", "/context"]) {
      await fetch(`/api/work/sessions/${sessionId}/files/${basePath}${sub}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isFolder: true }),
      });
    }
    await fetch(`/api/work/sessions/${sessionId}/files/${basePath}/AGENTS.md`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: newAgentPrompt || `# ${newAgentName}\n\nDescribe the role of this agent.` }),
    });
    setNewAgentName(""); setNewAgentPrompt(""); setShowCreateAgent(false);
    loadFiles(); onAgentListChange();
  };

  const deleteAgent = async (name: string) => {
    await fetch(`/api/work/sessions/${sessionId}/files/agents/${name}`, { method: "DELETE" });
    loadFiles(); onAgentListChange();
  };

  const tree = buildTree(files);
  const agents = Object.keys(tree.__kids?.agents?.__kids || {});

  return (
    <div className="flex flex-col h-full" style={{ background: S.bg }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: `1px solid ${S.border}` }}>
        <span className="text-xs font-bold uppercase tracking-widest" style={{ color: S.textMuted }}>Agents</span>
        <button onClick={() => setShowCreateAgent(true)}
          className="w-6 h-6 rounded-lg flex items-center justify-center text-base font-medium transition-all duration-200 hover:scale-110"
          style={{ color: S.accent, background: S.accentBg }}>
          +
        </button>
      </div>

      {/* Agent list */}
      <div className="flex-1 overflow-auto py-1">
        {agents.map((name) => {
          const isExpanded = expanded.has(`agents/${name}`);
          const color = getAgentColor(name);
          return (
            <div key={name} className="mb-0.5">
              <div className="flex items-center px-3 py-2 cursor-pointer group transition-colors"
                style={{ background: isExpanded ? "rgba(255,255,255,0.02)" : "transparent" }}
                onClick={() => toggleExpand(`agents/${name}`)}>
                <span className="text-[10px] mr-2 transition-transform duration-200" style={{ color: S.textMuted, transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)" }}>
                  &#9654;
                </span>
                <span className="w-2 h-2 rounded-full mr-2.5 flex-shrink-0" style={{ background: color }} />
                <span className="text-sm font-medium truncate" style={{ color: S.text }}>@{name}</span>
                <button onClick={(e) => { e.stopPropagation(); if (confirm(`Delete @${name}?`)) deleteAgent(name); }}
                  className="ml-auto text-xs opacity-0 group-hover:opacity-60 hover:opacity-100 transition-all px-1"
                  style={{ color: S.red }}>
                  &times;
                </button>
              </div>
              {isExpanded && (
                <div className="ml-7 border-l" style={{ borderColor: "rgba(255,255,255,0.04)" }}>
                  {renderFileChildren(`agents/${name}`, tree, expanded, toggleExpand, onFileSelect, selectedFile)}
                </div>
              )}
            </div>
          );
        })}
        {agents.length === 0 && (
          <div className="px-4 py-8 text-center text-xs leading-relaxed" style={{ color: S.textMuted }}>
            No agents yet.<br />
            <button onClick={() => setShowCreateAgent(true)} className="mt-2 font-medium hover:underline" style={{ color: S.accent }}>
              Create your first agent
            </button>
          </div>
        )}
      </div>

      {/* Workspace */}
      <div style={{ borderTop: `1px solid ${S.border}` }}>
        <div className="flex items-center px-4 py-3 cursor-pointer group" onClick={() => toggleExpand("workspace")}>
          <span className="text-[10px] mr-2 transition-transform duration-200" style={{ color: S.textMuted, transform: expanded.has("workspace") ? "rotate(90deg)" : "rotate(0deg)" }}>
            &#9654;
          </span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={S.textDim} strokeWidth="2" strokeLinecap="round" className="mr-2.5">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>
          <span className="text-xs font-bold uppercase tracking-widest" style={{ color: S.textMuted }}>Workspace</span>
        </div>
        {expanded.has("workspace") && (
          <div className="ml-7 border-l" style={{ borderColor: "rgba(255,255,255,0.04)" }}>
            {renderFileChildren("workspace", tree, expanded, toggleExpand, onFileSelect, selectedFile)}
          </div>
        )}
      </div>

      {/* Modal */}
      {showCreateAgent && <CreateModal name={newAgentName} setName={setNewAgentName} prompt={newAgentPrompt} setPrompt={setNewAgentPrompt} onCreate={createAgent} onClose={() => setShowCreateAgent(false)} />}
    </div>
  );
}

function CreateModal({ name, setName, prompt, setPrompt, onCreate, onClose }: {
  name: string; setName: (v: string) => void; prompt: string; setPrompt: (v: string) => void; onCreate: () => void; onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}>
      <div className="rounded-2xl p-6 w-[420px] shadow-2xl" style={{ background: S.panel, border: `1px solid ${S.border}`, animation: "pageIn 0.2s ease" }}>
        <h3 className="text-lg font-bold mb-5 tracking-tight" style={{ color: S.text }}>Define an Agent</h3>
        <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: S.textDim }}>Name</label>
        <input
          className="w-full rounded-xl px-4 py-3 text-sm outline-none mb-4 transition-all duration-200"
          style={{ background: S.bg, border: `1px solid ${S.border}`, color: S.text }}
          placeholder="e.g. architect, writer, reviewer"
          value={name} onChange={(e) => setName(e.target.value)} autoFocus
        />
        <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: S.textDim }}>System Prompt</label>
        <textarea
          className="w-full rounded-xl px-4 py-3 text-sm outline-none mb-5 resize-none h-28 transition-all duration-200"
          style={{ background: S.bg, border: `1px solid ${S.border}`, color: S.text }}
          placeholder="Describe what this agent does, its expertise, writing style, and personality..."
          value={prompt} onChange={(e) => setPrompt(e.target.value)}
        />
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-5 py-2.5 text-sm font-medium rounded-xl transition-colors" style={{ color: S.textDim }}>
            Cancel
          </button>
          <button onClick={onCreate}
            className="px-5 py-2.5 text-sm font-bold rounded-xl transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0"
            style={{ background: `linear-gradient(135deg, ${S.accent}, ${S.accentDeep})`, color: S.bg, boxShadow: "0 2px 16px rgba(245,158,11,0.2)" }}>
            Create Agent
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Tree helpers ──

function buildTree(files: FileEntry[]): Record<string, any> {
  const root: Record<string, any> = { __kids: {} };
  const folderPaths = new Set<string>();
  for (const f of files) {
    const parts = f.path.split("/");
    for (let i = 1; i <= parts.length - 1; i++) folderPaths.add(parts.slice(0, i).join("/"));
  }
  for (const fp of folderPaths) {
    const parts = fp.split("/");
    let node = root;
    for (const part of parts) {
      if (!node.__kids) node.__kids = {};
      if (!node.__kids[part]) node.__kids[part] = { __kids: {} };
      node = node.__kids[part];
    }
  }
  for (const f of files) {
    const parts = f.path.split("/");
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) node = node.__kids[parts[i]];
    if (!node.__kids) node.__kids = {};
    node.__kids[parts[parts.length - 1]] = f;
  }
  return root;
}

function renderFileChildren(
  prefix: string, tree: Record<string, any>, expanded: Set<string>,
  toggleExpand: (p: string) => void, onFileSelect: (p: string, c: string) => void, selectedFile: string | null,
): React.ReactNode[] {
  const parts = prefix.split("/");
  let node = tree;
  for (const part of parts) {
    if (!node.__kids || !node.__kids[part]) return [];
    node = node.__kids[part];
  }
  if (!node.__kids) return [];
  return (Object.entries(node.__kids) as Array<[string, any]>).map(([name, child]) => {
    const cp = `${prefix}/${name}`;
    const isFolder = child && typeof child === "object" && child.__kids !== undefined;
    if (isFolder) {
      return (
        <div key={cp}>
          <div className="flex items-center py-1.5 pr-3 cursor-pointer group" onClick={() => toggleExpand(cp)}
            style={{ paddingLeft: "12px" }}>
            <span className="text-[10px] mr-2 transition-transform duration-200 flex-shrink-0" style={{ color: S.textMuted, transform: expanded.has(cp) ? "rotate(90deg)" : "rotate(0deg)" }}>
              &#9654;
            </span>
            <span className="text-xs truncate font-medium" style={{ color: S.textDim }}>{name}</span>
          </div>
          {expanded.has(cp) && renderFileChildren(cp, tree, expanded, toggleExpand, onFileSelect, selectedFile)}
        </div>
      );
    }
    const file = child as FileEntry;
    const isActive = selectedFile === cp;
    return (
      <div key={cp} className="flex items-center py-1.5 pr-3 cursor-pointer group transition-colors"
        style={{ paddingLeft: "12px", background: isActive ? S.activeBg : "transparent", borderRight: isActive ? `2px solid ${S.accent}` : "2px solid transparent" }}
        onClick={() => onFileSelect(cp, file.content || "")}>
        <span className="text-[10px] mr-2 flex-shrink-0" style={{ color: S.textMuted }}>--</span>
        <span className="text-xs truncate" style={{ color: isActive ? S.accent : S.textDim }}>{name}</span>
      </div>
    );
  });
}

export default AgentPanel;
