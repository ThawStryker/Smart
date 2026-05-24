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

export function AgentPanel({ sessionId, onFileSelect, selectedFile, onAgentListChange }: AgentPanelProps) {
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set(["agents", "workspace"]));
  const [showCreateAgent, setShowCreateAgent] = useState(false);
  const [newAgentName, setNewAgentName] = useState("");
  const [newAgentPrompt, setNewAgentPrompt] = useState("");

  const loadFiles = useCallback(async () => {
    const res = await fetch(`/api/work/sessions/${sessionId}/files`);
    if (res.ok) {
      setFiles(await res.json());
    }
  }, [sessionId]);

  useEffect(() => {
    if (sessionId) loadFiles();
  }, [sessionId, loadFiles]);

  const toggleExpand = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const createAgent = async () => {
    if (!newAgentName.trim()) return;
    const basePath = `agents/${newAgentName.trim()}`;

    // Create folders and AGENTS.md
    await fetch(`/api/work/sessions/${sessionId}/files/${basePath}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isFolder: true }),
    });
    await fetch(`/api/work/sessions/${sessionId}/files/${basePath}/memory`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isFolder: true }),
    });
    await fetch(`/api/work/sessions/${sessionId}/files/${basePath}/skills`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isFolder: true }),
    });
    await fetch(`/api/work/sessions/${sessionId}/files/${basePath}/context`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isFolder: true }),
    });
    await fetch(`/api/work/sessions/${sessionId}/files/${basePath}/AGENTS.md`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: newAgentPrompt || `# ${newAgentName}\n\nDescribe the role, writing style, and capabilities of this agent.` }),
    });

    setNewAgentName("");
    setNewAgentPrompt("");
    setShowCreateAgent(false);
    loadFiles();
    onAgentListChange();
  };

  const deleteAgent = async (name: string) => {
    await fetch(`/api/work/sessions/${sessionId}/files/agents/${name}`, {
      method: "DELETE",
    });
    loadFiles();
    onAgentListChange();
  };

  const tree = buildTree(files);
  const agents = Object.keys(tree.__kids?.agents?.__kids || {});

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <span className="font-semibold text-sm">Agents</span>
        <button
          onClick={() => setShowCreateAgent(true)}
          className="text-lg leading-none text-blue-600 hover:text-blue-800 px-1"
          title="Create agent"
        >
          +
        </button>
      </div>

      {/* Agent list */}
      <div className="flex-1 overflow-auto">
        {agents.map((name) => (
          <div key={name}>
            <div
              className="flex items-center px-3 py-1.5 hover:bg-gray-100 cursor-pointer group"
              onClick={() => toggleExpand(`agents/${name}`)}
            >
              <span className="text-xs mr-1 w-3 text-center">
                {expanded.has(`agents/${name}`) ? "▼" : "▶"}
              </span>
              <span className="text-sm">@{name}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm(`Delete @${name}?`)) deleteAgent(name);
                }}
                className="ml-auto text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 text-xs"
              >
                &times;
              </button>
            </div>
            {expanded.has(`agents/${name}`) && (
              <div className="ml-4">
                {renderFileChildren(
                  `agents/${name}`,
                  tree,
                  expanded,
                  toggleExpand,
                  onFileSelect,
                  selectedFile,
                )}
              </div>
            )}
          </div>
        ))}
        {agents.length === 0 && (
          <div className="px-3 py-4 text-xs text-gray-400 text-center">
            No agents yet. Click + to create one.
          </div>
        )}
      </div>

      {/* Workspace files section */}
      <div className="border-t">
        <div
          className="flex items-center px-3 py-2 hover:bg-gray-100 cursor-pointer font-semibold text-sm"
          onClick={() => toggleExpand("workspace")}
        >
          <span className="text-xs mr-1 w-3 text-center">
            {expanded.has("workspace") ? "▼" : "▶"}
          </span>
          Workspace
        </div>
        {expanded.has("workspace") && (
          <div className="ml-4">
            {renderFileChildren(
              "workspace",
              tree,
              expanded,
              toggleExpand,
              onFileSelect,
              selectedFile,
            )}
          </div>
        )}
      </div>

      {/* Create Agent Modal */}
      {showCreateAgent && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-96 shadow-xl">
            <h3 className="text-lg font-semibold mb-4">Create Agent</h3>
            <label className="block text-xs text-gray-600 mb-1">Name</label>
            <input
              className="w-full border rounded px-3 py-2 mb-3 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="architect"
              value={newAgentName}
              onChange={(e) => setNewAgentName(e.target.value)}
              autoFocus
            />
            <label className="block text-xs text-gray-600 mb-1">System Prompt</label>
            <textarea
              className="w-full border rounded px-3 py-2 mb-4 text-sm h-32 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
              placeholder="Describe what this agent does, its writing style, and capabilities..."
              value={newAgentPrompt}
              onChange={(e) => setNewAgentPrompt(e.target.value)}
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowCreateAgent(false)}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded"
              >
                Cancel
              </button>
              <button
                onClick={createAgent}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tree helpers ──

// Build a clean tree: intermediate nodes are plain { __kids: {...} } objects.
// FileEntries are stored directly as values in __kids.
function buildTree(files: FileEntry[]): Record<string, any> {
  const root: Record<string, any> = { __kids: {} };

  // First pass: ensure all folder paths exist
  const folderPaths = new Set<string>();
  for (const f of files) {
    const parts = f.path.split("/");
    for (let i = 1; i <= parts.length - 1; i++) {
      folderPaths.add(parts.slice(0, i).join("/"));
    }
  }

  for (const folderPath of folderPaths) {
    const parts = folderPath.split("/");
    let node = root;
    for (const part of parts) {
      if (!node.__kids) node.__kids = {};
      if (!node.__kids[part]) node.__kids[part] = { __kids: {} };
      node = node.__kids[part];
    }
  }

  // Second pass: place all files at their leaf positions
  for (const f of files) {
    const parts = f.path.split("/");
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      node = node.__kids[parts[i]];
    }
    if (!node.__kids) node.__kids = {};
    node.__kids[parts[parts.length - 1]] = f;
  }

  return root;
}

function renderFileChildren(
  prefix: string,
  tree: Record<string, any>,
  expanded: Set<string>,
  toggleExpand: (path: string) => void,
  onFileSelect: (path: string, content: string) => void,
  selectedFile: string | null,
): React.ReactNode[] {
  // Navigate to the node for this prefix
  const parts = prefix.split("/");
  let node = tree;
  for (const part of parts) {
    if (!node.__kids || !node.__kids[part]) return [];
    node = node.__kids[part];
  }

  if (!node.__kids) return [];
  const entries = Object.entries(node.__kids) as Array<[string, any]>;

  return entries.map(([name, child]) => {
    const childPath = `${prefix}/${name}`;
    const isFolder = child && typeof child === "object" && child.__kids !== undefined;

    if (isFolder) {
      return (
        <div key={childPath}>
          <div
            className="flex items-center px-3 py-1 hover:bg-gray-100 cursor-pointer text-sm"
            onClick={() => toggleExpand(childPath)}
          >
            <span className="text-xs mr-1 w-3 text-center">
              {expanded.has(childPath) ? "▼" : "▶"}
            </span>
            <span className="text-gray-600">{name}</span>
          </div>
          {expanded.has(childPath) &&
            renderFileChildren(childPath, tree, expanded, toggleExpand, onFileSelect, selectedFile)}
        </div>
      );
    }

    const file = child as FileEntry;
    return (
      <div
        key={childPath}
        className={`flex items-center px-3 py-1 hover:bg-gray-100 cursor-pointer text-sm truncate ${
          selectedFile === childPath ? "bg-blue-50 text-blue-700" : ""
        }`}
        onClick={() => onFileSelect(childPath, file.content || "")}
      >
        <span className="mr-1 shrink-0 text-xs">~</span>
        <span className="truncate">{name}</span>
      </div>
    );
  });
}

export default AgentPanel;
