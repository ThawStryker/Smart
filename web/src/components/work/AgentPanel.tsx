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
    const existingNames = Object.keys(tree.__kids?.agents?.__kids || {});
    let idx = existingNames.length + 1;
    let name = `新Agent ${idx}`;
    while (existingNames.includes(name)) { idx++; name = `新Agent ${idx}`; }
    const base = `agents/${name}`;
    // Single batch: all folders + AGENTS.md in one round trip
    await fetch(`/api/work/sessions/${sessionId}/files/batch`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify([
        { path: `${base}/AGENTS.md`, content: `# ${name}\n\nDescribe the role of this agent.` },
        { path: `${base}/memory/README.md`, content: "# Memory\n\nAgent memories and learned knowledge." },
        { path: `${base}/skills/README.md`, content: "# Skills\n\nAdd skill definitions here." },
        { path: `${base}/context/README.md`, content: "# Context\n\nReference materials for the agent." },
        { path: `${base}/heartbeat.md`, content: `## Status\n- Created: ${new Date().toISOString()}\n` },
      ]),
    });
    loadFiles(); onAgentListChange();
  };

  const renameAgent = async (oldName: string, newName: string) => {
    if (!newName.trim() || newName.trim() === oldName) return;
    const agentFiles = files.filter((f) => f.path.startsWith(`agents/${oldName}/`));
    // Copy all files in parallel, then delete old
    await Promise.all(agentFiles.map((f) => {
      const newPath = f.path.replace(`agents/${oldName}/`, `agents/${newName.trim()}/`);
      return fetch(`/api/work/sessions/${sessionId}/files/${newPath}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: f.content, isFolder: f.isFolder ? true : undefined }),
      });
    }));
    await fetch(`/api/work/sessions/${sessionId}/files/agents/${oldName}`, { method: "DELETE" });
    loadFiles(); onAgentListChange();
  };

  const deleteAgent = async (name: string) => {
    await fetch(`/api/work/sessions/${sessionId}/files/agents/${name}`, { method: "DELETE" });
    loadFiles(); onAgentListChange();
  };

  const createFile = useCallback(async (parentPath: string) => {
    const prefix = parentPath.endsWith("/") ? parentPath : `${parentPath}/`;
    const name = `新文件.md`;
    let path = `${prefix}${name}`;
    let idx = 1;
    while (files.some((f) => f.path === path)) { idx++; path = `${prefix}新文件 ${idx}.md`; }
    await fetch(`/api/work/sessions/${sessionId}/files/${path}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "" }),
    });
    loadFiles();
  }, [sessionId, files, loadFiles]);

  const createFolder = useCallback(async (parentPath: string) => {
    const prefix = parentPath.endsWith("/") ? parentPath : `${parentPath}/`;
    const name = "新文件夹";
    let path = `${prefix}${name}`;
    let idx = 1;
    while (files.some((f) => f.path === path)) { idx++; path = `${prefix}新文件夹 ${idx}`; }
    await fetch(`/api/work/sessions/${sessionId}/files/${path}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isFolder: true }),
    });
    loadFiles();
  }, [sessionId, files, loadFiles]);

  const renameFolder = useCallback(async (folderPath: string, newName: string) => {
    if (!newName.trim()) return;
    const parentPath = folderPath.split("/").slice(0, -1).join("/");
    const newPath = parentPath ? `${parentPath}/${newName.trim()}` : newName.trim();
    if (newPath === folderPath) return;
    const children = files.filter((f) => f.path.startsWith(`${folderPath}/`) || f.path === folderPath);
    // Copy all children to new paths, then delete old
    await Promise.all(children.map((f) => {
      const updated = f.path.replace(folderPath, newPath);
      return fetch(`/api/work/sessions/${sessionId}/files/${updated}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: f.content, isFolder: f.isFolder ? true : undefined }),
      });
    }));
    await fetch(`/api/work/sessions/${sessionId}/files/${folderPath}`, { method: "DELETE" });
    loadFiles();
  }, [sessionId, files, loadFiles]);

  const deleteFolder = useCallback(async (folderPath: string) => {
    if (!confirm(`Delete "${folderPath}" and all its contents?`)) return;
    await fetch(`/api/work/sessions/${sessionId}/files/${folderPath}`, { method: "DELETE" });
    loadFiles();
  }, [sessionId, loadFiles]);

  const renameFile = useCallback(async (filePath: string, newName: string) => {
    if (!newName.trim()) return;
    const parentPath = filePath.split("/").slice(0, -1).join("/");
    const newPath = parentPath ? `${parentPath}/${newName.trim()}` : newName.trim();
    if (newPath === filePath) return;
    const existing = files.find((f) => f.path === filePath);
    if (!existing) return;
    await fetch(`/api/work/sessions/${sessionId}/files/${newPath}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: existing.content, isFolder: false }),
    });
    await fetch(`/api/work/sessions/${sessionId}/files/${filePath}`, { method: "DELETE" });
    loadFiles();
  }, [sessionId, files, loadFiles]);

  const deleteFile = useCallback(async (filePath: string) => {
    if (!confirm(`Delete "${filePath}"?`)) return;
    await fetch(`/api/work/sessions/${sessionId}/files/${filePath}`, { method: "DELETE" });
    loadFiles();
  }, [sessionId, loadFiles]);

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
                <span className="mr-1.5 transition-transform duration-150 flex-shrink-0 opacity-60"
                  style={{ transform: isExpanded ? "rotate(0deg)" : "rotate(-90deg)", width: "12px", textAlign: "center" }}>
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="var(--app-text-tertiary)" strokeWidth="3" strokeLinecap="round">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </span>
                <span className="w-2 h-2 rounded-full mr-2 flex-shrink-0" style={{ background: color }} />
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
                  {renderFileChildren(`agents/${name}`, tree, expanded, toggleExpand, onFileSelect, selectedFile, 0, createFile, createFolder, renameFolder, deleteFolder, renameFile, deleteFile)}
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
          <span className="mr-1.5 transition-transform duration-150 flex-shrink-0 opacity-60"
            style={{ transform: expanded.has("workspace") ? "rotate(0deg)" : "rotate(-90deg)", width: "12px", textAlign: "center" }}>
            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="var(--app-text-tertiary)" strokeWidth="3" strokeLinecap="round">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--app-text-secondary)" strokeWidth="2" strokeLinecap="round" className="mr-2.5">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>
          <span className="text-xs font-bold uppercase tracking-widest text-[var(--app-text-tertiary)]">Workspace</span>
        </div>
        {expanded.has("workspace") && (
          <div className="ml-7 border-l border-[var(--app-border)]">
            {renderFileChildren("workspace", tree, expanded, toggleExpand, onFileSelect, selectedFile, 0, createFile, createFolder, renameFolder, deleteFolder, renameFile, deleteFile)}
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
    const lastName = parts[parts.length - 1];
    // Folders need __kids wrapper even when empty, so they render as folders
    if (f.isFolder) {
      const existing = node.__kids[lastName];
      if (existing && existing.__kids) {
        existing._entry = f;
      } else {
        node.__kids[lastName] = { __kids: {}, _entry: f };
      }
    } else {
      node.__kids[lastName] = f;
    }
  }
  return root;
}

function getFileIcon(name: string) {
  const base = name.split("/").pop() || name;
  if (base === "AGENTS.md") return AgentIcon;
  if (base === "heartbeat.md") return HeartbeatIcon;
  if (base === "README.md") return ReadmeIcon;
  if (base.endsWith(".md")) return DocIcon;
  return GenericFileIcon;
}

function renderFileChildren(
  prefix: string, tree: Record<string, any>, expanded: Set<string>,
  toggleExpand: (p: string) => void, onFileSelect: (p: string, c: string) => void, selectedFile: string | null,
  depth: number,
  createFile: (parentPath: string) => Promise<void>,
  createFolder: (parentPath: string) => Promise<void>,
  renameFolder: (folderPath: string, newName: string) => void,
  deleteFolder: (folderPath: string) => void,
  renameFile: (filePath: string, newName: string) => void,
  deleteFile: (filePath: string) => void,
): React.ReactNode[] {
  const parts = prefix.split("/");
  let node = tree;
  for (const part of parts) {
    if (!node.__kids || !node.__kids[part]) return [];
    node = node.__kids[part];
  }
  if (!node.__kids) return [];
  const entries = Object.entries(node.__kids) as Array<[string, any]>;
  // Sort: folders first, then files
  entries.sort(([, a], [, b]) => {
    const aIsFolder = a && typeof a === "object" && a.__kids !== undefined;
    const bIsFolder = b && typeof b === "object" && b.__kids !== undefined;
    if (aIsFolder && !bIsFolder) return -1;
    if (!aIsFolder && bIsFolder) return 1;
    return 0;
  });
  return entries.map(([name, child]) => {
    const cp = `${prefix}/${name}`;
    const isFolder = child && typeof child === "object" && child.__kids !== undefined;
    const isOpen = expanded.has(cp);
    const padLeft = 12 + depth * 14;

    if (isFolder) {
      return (
        <div key={cp}>
          <div
            className="flex items-center py-1 pr-1 cursor-pointer group transition-colors hover:bg-[var(--app-accent-bg)]"
            style={{ paddingLeft: `${padLeft}px` }}
            onClick={() => toggleExpand(cp)}
          >
            <span className="mr-1.5 transition-transform duration-150 flex-shrink-0 opacity-60"
              style={{ transform: isOpen ? "rotate(0deg)" : "rotate(-90deg)", width: "12px", textAlign: "center" }}>
              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="var(--app-text-tertiary)" strokeWidth="3" strokeLinecap="round">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </span>
            {name === "memory" ? <MemoryFolderIcon /> : name === "skills" ? <SkillsFolderIcon /> : name === "context" ? <ContextFolderIcon /> : <DefaultFolderIcon open={isOpen} />}
            <span className="text-xs truncate font-medium ml-1.5 text-[var(--app-text-secondary)] flex-1">{name}</span>
            <span className="opacity-0 group-hover:opacity-100 transition-opacity ml-1">
              <FolderMenu folderPath={cp} folderName={name}
                onCreateFile={createFile} onCreateFolder={createFolder}
                onRename={(n) => renameFolder(cp, n)}
                onDelete={() => deleteFolder(cp)} />
            </span>
          </div>
          {isOpen && renderFileChildren(cp, tree, expanded, toggleExpand, onFileSelect, selectedFile, depth + 1, createFile, createFolder, renameFolder, deleteFolder, renameFile, deleteFile)}
        </div>
      );
    }

    const file = child as FileEntry;
    const isActive = selectedFile === cp;
    const FileIcon = getFileIcon(name);
    return (
      <div key={cp}
        className="flex items-center py-1 pr-3 cursor-pointer group transition-colors hover:bg-[var(--app-accent-bg)]"
        style={{
          paddingLeft: `${padLeft}px`,
          background: isActive ? "var(--app-accent-bg)" : "transparent",
          borderRight: isActive ? "2px solid var(--app-accent)" : "2px solid transparent",
        }}
        onClick={() => onFileSelect(cp, file.content || "")}
      >
        {/* Spacer to align with folder icons that have a chevron */}
        <span className="flex-shrink-0" style={{ width: "18px" }} />
        <FileIcon active={isActive} />
        <span className="text-xs truncate ml-1.5 flex-1" style={{ color: isActive ? "var(--app-accent)" : "var(--app-text-secondary)" }}>{name}</span>
        <span className="opacity-0 group-hover:opacity-100 transition-opacity ml-1">
          <FileMenu fileName={name}
            onRename={(n) => renameFile(cp, n)}
            onDelete={() => deleteFile(cp)} />
        </span>
      </div>
    );
  });
}

// ── File icons (12x12 SVG) ──

function GenericFileIcon({ active }: { active?: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={active ? "var(--app-accent)" : "var(--app-text-tertiary)"} strokeWidth="2" strokeLinecap="round" className="flex-shrink-0">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

function DocIcon({ active }: { active?: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={active ? "var(--app-accent)" : "#60a5fa"} strokeWidth="2" strokeLinecap="round" className="flex-shrink-0">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  );
}

function AgentIcon({ active }: { active?: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={active ? "var(--app-accent)" : "var(--app-accent)"} strokeWidth="2" strokeLinecap="round" className="flex-shrink-0">
      <circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 4-7 8-7s8 3 8 7" />
    </svg>
  );
}

function HeartbeatIcon({ active }: { active?: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={active ? "var(--app-accent)" : "#f87171"} strokeWidth="2" strokeLinecap="round" className="flex-shrink-0">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  );
}

function ReadmeIcon({ active }: { active?: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={active ? "var(--app-accent)" : "var(--app-text-tertiary)"} strokeWidth="2" strokeLinecap="round" className="flex-shrink-0">
      <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  );
}

// ── Folder icons ──

function DefaultFolderIcon({ open }: { open: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--app-text-tertiary)" strokeWidth="2" strokeLinecap="round" className="flex-shrink-0">
      {open ? (
        <path d="M5 19a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v1M5 19h14a2 2 0 0 0 2-2v-5a2 2 0 0 0-2-2H9a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2z" />
      ) : (
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
      )}
    </svg>
  );
}

function MemoryFolderIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fb923c" strokeWidth="2" strokeLinecap="round" className="flex-shrink-0">
      <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  );
}

function SkillsFolderIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2" strokeLinecap="round" className="flex-shrink-0">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}

function ContextFolderIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2" strokeLinecap="round" className="flex-shrink-0">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  );
}

// ── Folder context menu ──

function FolderMenu({
  folderPath, folderName, onCreateFile, onCreateFolder, onRename, onDelete,
}: {
  folderPath: string; folderName: string;
  onCreateFile: (parentPath: string) => Promise<void>;
  onCreateFolder: (parentPath: string) => Promise<void>;
  onRename: (newName: string) => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <button onClick={() => setOpen(!open)}
        className="w-5 h-5 rounded flex items-center justify-center hover:bg-[var(--app-accent-bg)] transition-colors">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style={{ color: "var(--app-text-tertiary)" }}>
          <circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" />
        </svg>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-40 w-40 rounded-xl bg-[var(--app-surface)] border border-[var(--app-border)] shadow-xl overflow-hidden py-1">
            <MenuItem icon={<NewFileIcon />} label="New File" onClick={() => { onCreateFile(folderPath); setOpen(false); }} />
            <MenuItem icon={<NewFolderIcon />} label="New Folder" onClick={() => { onCreateFolder(folderPath); setOpen(false); }} />
            <div className="border-t border-[var(--app-border)] my-0.5" />
            <MenuItem icon={<RenameIcon />} label="Rename" onClick={() => { setOpen(false); const n = prompt("Rename to:", folderName); if (n) onRename(n); }} />
            <MenuItem icon={<DeleteIcon />} label="Delete" onClick={() => { onDelete(); setOpen(false); }} danger />
          </div>
        </>
      )}
    </div>
  );
}

function MenuItem({ icon, label, onClick, danger }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <div onClick={onClick}
      className="px-3 py-1.5 text-xs cursor-pointer transition-colors hover:bg-[var(--app-accent-bg)] flex items-center gap-2"
      style={{ color: danger ? "var(--app-red)" : "var(--app-text)" }}>
      {icon}
      {label}
    </div>
  );
}

function NewFileIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="flex-shrink-0">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="12" y1="18" x2="12" y2="12" /><line x1="9" y1="15" x2="15" y2="15" />
    </svg>
  );
}

function NewFolderIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="flex-shrink-0">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /><line x1="12" y1="11" x2="12" y2="17" /><line x1="9" y1="14" x2="15" y2="14" />
    </svg>
  );
}

function RenameIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="flex-shrink-0">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function DeleteIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="flex-shrink-0">
      <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

// ── File context menu ──

function FileMenu({
  fileName, onRename, onDelete,
}: {
  fileName: string;
  onRename: (newName: string) => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <button onClick={() => setOpen(!open)}
        className="w-5 h-5 rounded flex items-center justify-center hover:bg-[var(--app-accent-bg)] transition-colors">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style={{ color: "var(--app-text-tertiary)" }}>
          <circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" />
        </svg>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-40 w-36 rounded-xl bg-[var(--app-surface)] border border-[var(--app-border)] shadow-xl overflow-hidden py-1">
            <MenuItem icon={<RenameIcon />} label="Rename" onClick={() => { setOpen(false); const n = prompt("Rename to:", fileName); if (n) onRename(n); }} />
            <MenuItem icon={<DeleteIcon />} label="Delete" onClick={() => { onDelete(); setOpen(false); }} danger />
          </div>
        </>
      )}
    </div>
  );
}

export default AgentPanel;
