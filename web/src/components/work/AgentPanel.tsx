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

const agentColors = [
  "var(--app-accent)",
  "#4ade80",
  "#a78bfa",
  "#60a5fa",
  "#fb923c",
  "#f472b6",
];

function getAgentColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  return agentColors[Math.abs(hash) % agentColors.length];
}

export function AgentPanel({ sessionId, onFileSelect, selectedFile, onAgentListChange }: AgentPanelProps) {
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set(["agents", "workspace"]));
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

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
    // Find a unique default name
    const existingNames = Object.keys(tree.__kids?.agents?.__kids || {});
    let idx = existingNames.length + 1;
    let name = `新Agent ${idx}`;
    while (existingNames.includes(name)) { idx++; name = `新Agent ${idx}`; }
    const basePath = `agents/${name}`;
    for (const sub of ["", "/memory", "/skills", "/context"]) {
      await fetch(`/api/work/sessions/${sessionId}/files/${basePath}${sub}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isFolder: true }),
      });
    }
    await fetch(`/api/work/sessions/${sessionId}/files/${basePath}/AGENTS.md`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: `# ${name}\n\nDescribe the role of this agent.` }),
    });
    loadFiles(); onAgentListChange();
  };

  const renameAgent = async (oldName: string, newName: string) => {
    if (!newName.trim() || newName.trim() === oldName) return;
    // Get all files under the old agent path
    const agentFiles = files.filter((f) => f.path.startsWith(`agents/${oldName}/`));
    // Create new folders/files with new path, delete old
    for (const f of agentFiles) {
      const newPath = f.path.replace(`agents/${oldName}/`, `agents/${newName.trim()}/`);
      await fetch(`/api/work/sessions/${sessionId}/files/${newPath}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: f.content, isFolder: f.isFolder ? true : undefined }),
      });
    }
    await fetch(`/api/work/sessions/${sessionId}/files/agents/${oldName}`, { method: "DELETE" });
    loadFiles(); onAgentListChange();
  };

  const deleteAgent = async (name: string) => {
    await fetch(`/api/work/sessions/${sessionId}/files/agents/${name}`, { method: "DELETE" });
    loadFiles(); onAgentListChange();
  };

  const tree = buildTree(files);
  const agents = Object.keys(tree.__kids?.agents?.__kids || {});

  return (
    <div className="flex flex-col h-full bg-[var(--app-bg)]">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--app-border)]">
        <span className="text-xs font-bold uppercase tracking-widest text-[var(--app-text-tertiary)]">Agents</span>
        <button onClick={createAgent}
          className="w-6 h-6 rounded-lg flex items-center justify-center text-base font-medium transition-all duration-200 hover:scale-110 bg-[var(--app-accent-bg)] text-[var(--app-accent)]">+</button>
      </div>

      <div className="flex-1 overflow-auto py-1">
        {agents.map((name) => {
          const isExpanded = expanded.has(`agents/${name}`);
          const color = getAgentColor(name);
          return (
            <div key={name} className="mb-0.5">
              <div className="flex items-center px-3 py-2 cursor-pointer group transition-colors"
                style={{ background: isExpanded ? "rgba(255,255,255,0.02)" : "transparent" }}
                onClick={() => toggleExpand(`agents/${name}`)}>
                <span className="text-[10px] mr-2 transition-transform duration-200 text-[var(--app-text-tertiary)]"
                  style={{ transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)" }}>&#9654;</span>
                <span className="w-2 h-2 rounded-full mr-2.5 flex-shrink-0" style={{ background: color }} />
                {renaming === name ? (
                  <input value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={() => { renameAgent(name, renameValue); setRenaming(null); }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { renameAgent(name, renameValue); setRenaming(null); }
                      if (e.key === "Escape") setRenaming(null);
                    }}
                    className="flex-1 bg-[var(--app-surface)] border border-[var(--app-accent)] rounded px-2 py-0.5 text-sm outline-none text-[var(--app-text)] min-w-0"
                    autoFocus
                    onFocus={(e) => e.target.select()}
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <span className="text-sm font-medium truncate text-[var(--app-text)] cursor-pointer hover:opacity-70"
                    onDoubleClick={(e) => { e.stopPropagation(); setRenaming(name); setRenameValue(name); }}>
                    @{name}
                  </span>
                )}
                <button onClick={(e) => { e.stopPropagation(); if (confirm(`Delete @${name}?`)) deleteAgent(name); }}
                  className="ml-auto text-xs opacity-0 group-hover:opacity-60 hover:opacity-100 transition-all px-1 text-[var(--app-red)]">&times;</button>
              </div>
              {isExpanded && (
                <div className="ml-7 border-l border-[var(--app-border)]">
                  {renderFileChildren(`agents/${name}`, tree, expanded, toggleExpand, onFileSelect, selectedFile)}
                </div>
              )}
            </div>
          );
        })}
        {agents.length === 0 && (
          <div className="px-4 py-8 text-center text-xs leading-relaxed text-[var(--app-text-tertiary)]">
            No agents yet.<br />
            <button onClick={createAgent} className="mt-2 font-medium hover:underline text-[var(--app-accent)]">Create your first agent</button>
          </div>
        )}
      </div>

      <div className="border-t border-[var(--app-border)]">
        <div className="flex items-center px-4 py-3 cursor-pointer group" onClick={() => toggleExpand("workspace")}>
          <span className="text-[10px] mr-2 transition-transform duration-200 text-[var(--app-text-tertiary)]"
            style={{ transform: expanded.has("workspace") ? "rotate(90deg)" : "rotate(0deg)" }}>&#9654;</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--app-text-secondary)" strokeWidth="2" strokeLinecap="round" className="mr-2.5">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>
          <span className="text-xs font-bold uppercase tracking-widest text-[var(--app-text-tertiary)]">Workspace</span>
        </div>
        {expanded.has("workspace") && (
          <div className="ml-7 border-l border-[var(--app-border)]">
            {renderFileChildren("workspace", tree, expanded, toggleExpand, onFileSelect, selectedFile)}
          </div>
        )}
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
          <div className="flex items-center py-1.5 pr-3 cursor-pointer group" style={{ paddingLeft: "12px" }} onClick={() => toggleExpand(cp)}>
            <span className="text-[10px] mr-2 transition-transform duration-200 flex-shrink-0 text-[var(--app-text-tertiary)]"
              style={{ transform: expanded.has(cp) ? "rotate(90deg)" : "rotate(0deg)" }}>&#9654;</span>
            <span className="text-xs truncate font-medium text-[var(--app-text-secondary)]">{name}</span>
          </div>
          {expanded.has(cp) && renderFileChildren(cp, tree, expanded, toggleExpand, onFileSelect, selectedFile)}
        </div>
      );
    }
    const file = child as FileEntry;
    const isActive = selectedFile === cp;
    return (
      <div key={cp} className="flex items-center py-1.5 pr-3 cursor-pointer group transition-colors"
        style={{ paddingLeft: "12px", background: isActive ? "var(--app-accent-bg)" : "transparent", borderRight: isActive ? "2px solid var(--app-accent)" : "2px solid transparent" }}
        onClick={() => onFileSelect(cp, file.content || "")}>
        <span className="text-[10px] mr-2 flex-shrink-0 text-[var(--app-text-tertiary)]">--</span>
        <span className="text-xs truncate" style={{ color: isActive ? "var(--app-accent)" : "var(--app-text-secondary)" }}>{name}</span>
      </div>
    );
  });
}

export default AgentPanel;
