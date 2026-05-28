import { useState, useEffect, useCallback, useRef } from "react";
import { getAgentAvatar } from "./icons";
import { WorkspacePanel } from "./WorkspacePanel";
import { buildTree, renderFileChildren } from "./FileTree";
import type { FileEntry } from "@/types/work";

interface AgentPanelProps {
  sessionId: number;
  onFileSelect: (path: string, content: string) => void;
  selectedFile: string | null;
  onAgentListChange: () => void;
  reloadTrigger?: number;
}

export function AgentPanel({ sessionId, onFileSelect, selectedFile, onAgentListChange, reloadTrigger }: AgentPanelProps) {
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set(["agents"]));
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [agentNames, setAgentNames] = useState<string[]>([]);
  const pendingDeletesRef = useRef<Set<string>>(new Set());

  const startFileRename = (path: string, name: string) => { setRenamingPath(path); setRenameValue(name); };
  const finishFileRename = (path: string, oldName: string) => {
    if (renameValue.trim() && renameValue.trim() !== oldName) {
      if (path.includes(`/${oldName}`)) {
        const tree = buildTree(files);
        const isFolder = (() => {
          const parts = path.split("/");
          let node: any = tree;
          for (const p of parts) { if (!node?.__kids?.[p]) return false; node = node.__kids[p]; }
          return node && typeof node === "object" && "__kids" in node;
        })();
        if (isFolder) renameFolder(path, renameValue.trim());
        else renameFile(path, renameValue.trim());
      }
    }
    setRenamingPath(null);
    setRenameValue("");
  };

  const loadFiles = useCallback(async () => {
    const [sessionRes, workspaceRes, agentRes] = await Promise.all([
      fetch(`/api/work/sessions/${sessionId}/files`),
      fetch("/api/work/workspace"),
      fetch("/api/agents"),
    ]);
    let allFiles: FileEntry[] = [];
    // Session files — exclude workspace/ and agents/ (now in their own tables)
    if (sessionRes.ok) {
      const sf = await sessionRes.json();
      allFiles = sf.filter((f: FileEntry) => !f.path.startsWith("workspace/") && !f.path.startsWith("agents/"));
    }
    // Workspace files — prefix with "workspace/" for tree display
    if (workspaceRes.ok) {
      const wsFiles = await workspaceRes.json();
      for (const f of wsFiles) {
        allFiles.push({ ...f, path: `workspace/${f.path}` });
      }
    }
    // Agent files — prefix with "agents/<name>/" for tree display (parallel)
    if (agentRes.ok) {
      const agents = await agentRes.json();
      const agentFileResults = await Promise.all(
        agents.map(async (a: { name: string }) => {
          const r = await fetch(`/api/agents/${a.name}/files`);
          if (!r.ok) return [];
          const files = await r.json();
          return files.map((f: FileEntry) => ({ ...f, path: `agents/${a.name}/${f.path}` }));
        }),
      );
      for (const af of agentFileResults) allFiles.push(...af);
    }
    // Deduplicate by path + skip pending deletes
    const seen = new Set<string>();
    setFiles(allFiles.filter((f: FileEntry) => {
      if (pendingDeletesRef.current.has(f.path)) return false;
      if (seen.has(f.path)) return false;
      seen.add(f.path);
      return true;
    }));
  }, [sessionId]);

  const loadUserAgents = useCallback(async () => {
    const res = await fetch("/api/agents");
    if (res.ok) {
      const data: Array<{ name: string }> = await res.json();
      setAgentNames(data.map((a) => a.name));
      onAgentListChange();
    }
  }, [onAgentListChange]);

  useEffect(() => { if (sessionId) loadFiles(); }, [sessionId, loadFiles]);
  useEffect(() => { loadUserAgents(); }, [loadUserAgents]);
  useEffect(() => { if (reloadTrigger && sessionId) loadFiles(); }, [reloadTrigger]);

  const toggleExpand = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path); else next.add(path);
      return next;
    });
  };

  const createAgent = async () => {
    let idx = agentNames.length + 1;
    let name = `新Agent ${idx}`;
    while (agentNames.includes(name)) { idx++; name = `新Agent ${idx}`; }
    await fetch("/api/agents", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    loadFiles(); loadUserAgents();
  };

  const renameAgent = async (oldName: string, newName: string) => {
    if (!newName.trim() || newName.trim() === oldName) return;
    await fetch(`/api/agents/${oldName}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim() }),
    });
    loadFiles(); loadUserAgents();
  };

  const deleteAgent = async (name: string) => {
    setAgentNames((prev) => prev.filter((a) => a !== name));
    setFiles((prev) => prev.filter((f) => !f.path.startsWith(`agents/${name}/`)));
    try {
      await fetch(`/api/agents/${name}`, { method: "DELETE" });
    } catch { loadFiles(); loadUserAgents(); }
  };

  const createFile = useCallback(async (parentPath: string) => {
    const prefix = parentPath.endsWith("/") ? parentPath : `${parentPath}/`;
    const name = `新文件.md`;
    let path = `${prefix}${name}`;
    let idx = 1;
    while (files.some((f) => f.path === path)) { idx++; path = `${prefix}新文件 ${idx}.md`; }
    const api = resolveApi(path);
    if (api) await fetch(api.url, { method: api.method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: "" }) });
    loadFiles();
  }, [sessionId, files, loadFiles]);

  const createFolder = useCallback(async (parentPath: string) => {
    const prefix = parentPath.endsWith("/") ? parentPath : `${parentPath}/`;
    const name = "新文件夹";
    let path = `${prefix}${name}`;
    let idx = 1;
    while (files.some((f) => f.path === path)) { idx++; path = `${prefix}新文件夹 ${idx}`; }
    const api = resolveApi(path);
    if (api) await fetch(api.url, { method: api.method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isFolder: true }) });
    loadFiles();
  }, [sessionId, files, loadFiles]);

  const renameFolder = useCallback(async (folderPath: string, newName: string) => {
    if (!newName.trim()) return;
    const parentPath = folderPath.split("/").slice(0, -1).join("/");
    const newPath = parentPath ? `${parentPath}/${newName.trim()}` : newName.trim();
    if (newPath === folderPath) return;
    const children = files.filter((f) => f.path.startsWith(`${folderPath}/`) || f.path === folderPath);
    await Promise.all(children.map((f) => {
      const updated = f.path.replace(folderPath, newPath);
      const api = resolveApi(updated);
      if (api) return fetch(api.url, { method: api.method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: f.content, isFolder: f.isFolder ? true : undefined }) });
    }));
    await fetch(resolveApiDelete(folderPath), { method: "DELETE" });
    loadFiles();
  }, [files, loadFiles]);

  const encodePath = (p: string) => p.split("/").map(encodeURIComponent).join("/");

  // Resolve tree path to API url + apiPath
  function resolveApi(treePath: string): { url: string; method: string } | null {
    const agentMatch = treePath.match(/^agents\/([^/]+)\/(.+)$/);
    if (agentMatch) {
      return { url: `/api/agents/${encodeURIComponent(agentMatch[1])}/files/${encodePath(agentMatch[2])}`, method: "PUT" };
    }
    if (treePath.startsWith("workspace/")) {
      const apiPath = treePath.slice("workspace/".length);
      return { url: `/api/work/workspace/${encodePath(apiPath)}`, method: "PUT" };
    }
    return { url: `/api/work/sessions/${sessionId}/files/${encodePath(treePath)}`, method: "PUT" };
  }

  function resolveApiDelete(treePath: string): string {
    const agentMatch = treePath.match(/^agents\/([^/]+)\/(.+)$/);
    if (agentMatch) {
      return `/api/agents/${encodeURIComponent(agentMatch[1])}/files/${encodePath(agentMatch[2])}`;
    }
    if (treePath.startsWith("workspace/")) {
      const apiPath = treePath.slice("workspace/".length);
      return `/api/work/workspace/${encodePath(apiPath)}`;
    }
    return `/api/work/sessions/${sessionId}/files/${encodePath(treePath)}`;
  }

  const deleteFolder = useCallback(async (folderPath: string) => {
    if (!confirm(`Delete "${folderPath}" and all its contents?`)) return;
    pendingDeletesRef.current.add(folderPath);
    setFiles((prev) => prev.filter((f) => f.path !== folderPath && !f.path.startsWith(`${folderPath}/`)));
    try {
      const res = await fetch(resolveApiDelete(folderPath), { method: "DELETE" });
      if (!res.ok) throw new Error(`Delete failed: ${res.status}`);
    } catch { loadFiles(); }
    pendingDeletesRef.current.delete(folderPath);
  }, [loadFiles]);

  const renameFile = useCallback(async (filePath: string, newName: string) => {
    if (!newName.trim()) return;
    const parentPath = filePath.split("/").slice(0, -1).join("/");
    const newPath = parentPath ? `${parentPath}/${newName.trim()}` : newName.trim();
    if (newPath === filePath) return;
    // Fetch current content from server (files state may be stale)
    let currentContent = "";
    const getUrl = resolveApi(filePath)?.url;
    if (getUrl) {
      try {
        const r = await fetch(getUrl);
        if (r.ok) {
          const data = await r.json();
          currentContent = data.content || "";
        }
      } catch {}
    }
    const newApi = resolveApi(newPath);
    if (newApi) {
      await fetch(newApi.url, { method: newApi.method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: currentContent, isFolder: false }) });
    }
    await fetch(resolveApiDelete(filePath), { method: "DELETE" });
    loadFiles();
  }, [loadFiles]);

  const deleteFile = useCallback(async (filePath: string) => {
    if (!confirm(`Delete "${filePath}"?`)) return;
    pendingDeletesRef.current.add(filePath);
    setFiles((prev) => prev.filter((f) => f.path !== filePath));
    try {
      const res = await fetch(resolveApiDelete(filePath), { method: "DELETE" });
      if (!res.ok) throw new Error(`Delete failed: ${res.status}`);
    } catch { loadFiles(); }
    pendingDeletesRef.current.delete(filePath);
  }, [loadFiles]);

  const tree = buildTree(files);
  const agents = agentNames;

  return (
    <div className="flex flex-col h-full bg-[var(--app-bg)]">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--app-border)]">
        <span className="text-xs font-bold uppercase tracking-widest text-[var(--app-text-tertiary)]">Agents</span>
        <button onClick={createAgent}
          className="w-6 h-6 rounded-lg flex items-center justify-center text-sm font-bold transition-all duration-200 hover:scale-110 bg-[var(--app-accent-bg)] text-[var(--app-accent)] leading-none">+</button>
      </div>

      <div className="overflow-auto py-1" style={{ flex: "1 1 0", minHeight: 0 }}>
        {agents.map((name) => {
          const isExpanded = expanded.has(`agents/${name}`);
          const avatar = getAgentAvatar(name);
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
                <span className="text-sm mr-2 flex-shrink-0 leading-none">{avatar}</span>
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
                  <span className="text-sm font-medium truncate text-[var(--app-text)]">
                    {name}
                  </span>
                )}
                <span className="opacity-0 group-hover:opacity-100 transition-opacity ml-auto">
                  <AgentMenu agentName={name}
                    onRename={() => { setRenaming(name); setRenameValue(name); }}
                    onDelete={() => deleteAgent(name)} />
                </span>
              </div>
              {isExpanded && (
                <div className="ml-7 border-l border-[var(--app-border)]">
                  {renderFileChildren(`agents/${name}`, tree, expanded, toggleExpand, onFileSelect, selectedFile, 0, createFile, createFolder, renameFolder, deleteFolder, renameFile, deleteFile, renamingPath, renameValue, startFileRename, setRenameValue, finishFileRename)}
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

      <WorkspacePanel
        expanded={expanded}
        toggleExpand={toggleExpand}
        tree={tree}
        onFileSelect={onFileSelect}
        selectedFile={selectedFile}
        createFile={createFile}
        createFolder={createFolder}
        renameFolder={renameFolder}
        deleteFolder={deleteFolder}
        renameFile={renameFile}
        deleteFile={deleteFile}
        renamingPath={renamingPath}
        renameValue={renameValue}
        onStartRename={startFileRename}
        onRenameChange={setRenameValue}
        onFinishRename={finishFileRename}
      />

    </div>
  );
}

// ── Agent kebab menu ──

function AgentMenu({ agentName, onRename, onDelete }: { agentName: string; onRename: () => void; onDelete: () => void }) {
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
          <div className="absolute right-0 top-full mt-1 z-40 w-32 rounded-xl bg-[var(--app-surface)] border border-[var(--app-border)] shadow-xl overflow-hidden py-1">
            <div onClick={() => { onRename(); setOpen(false); }}
              className="px-3 py-1.5 text-xs cursor-pointer transition-colors hover:bg-[var(--app-accent-bg)] flex items-center gap-2 text-[var(--app-text)]">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="flex-shrink-0"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
              Rename
            </div>
            <div onClick={() => { if (confirm(`Delete ${agentName}?`)) { onDelete(); setOpen(false); } }}
              className="px-3 py-1.5 text-xs cursor-pointer transition-colors hover:bg-[var(--app-accent-bg)] flex items-center gap-2 text-[var(--app-red)]">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="flex-shrink-0"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
              Delete
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default AgentPanel;
