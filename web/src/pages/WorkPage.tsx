import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { AgentPanel } from "@/components/work/AgentPanel";
import { DocumentEditor } from "@/components/work/DocumentEditor";
import { ChatPanel } from "@/components/work/ChatPanel";

interface WorkSession {
  id: number;
  title: string;
  summary: string;
}

export function WorkPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const sessionId = parseInt(searchParams.get("session") || "0");
  const [sessions, setSessions] = useState<WorkSession[]>([]);
  const [activeFile, setActiveFile] = useState<{ path: string; content: string } | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [agents, setAgents] = useState<string[]>([]);
  const [showNewSession, setShowNewSession] = useState(false);
  const [newSessionTitle, setNewSessionTitle] = useState("");

  const loadSessions = useCallback(async () => {
    const res = await fetch("/api/work/sessions");
    if (res.ok) {
      const data = await res.json();
      setSessions(data);
      if (!sessionId && data.length > 0) {
        setSearchParams({ session: String(data[0].id) });
      }
    }
  }, [sessionId, setSearchParams]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const loadAgents = useCallback(async () => {
    if (!sessionId) return;
    const res = await fetch(`/api/work/sessions/${sessionId}/files?prefix=agents/`);
    if (res.ok) {
      const files: Array<{ path: string }> = await res.json();
      const names = new Set<string>();
      for (const f of files) {
        const match = f.path.match(/^agents\/([^/]+)\//);
        if (match) names.add(match[1]);
      }
      setAgents(Array.from(names));
    }
  }, [sessionId]);

  useEffect(() => {
    loadAgents();
  }, [loadAgents]);

  const createSession = async () => {
    if (!newSessionTitle.trim()) return;
    const res = await fetch("/api/work/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newSessionTitle.trim() }),
    });
    if (res.ok) {
      const s = await res.json();
      setNewSessionTitle("");
      setShowNewSession(false);
      setSearchParams({ session: String(s.id) });
      loadSessions();
    }
  };

  const handleFileSelect = (path: string, content: string) => {
    setActiveFile({ path, content });
    setIsStreaming(false);
  };

  const handleSave = async (path: string, content: string) => {
    await fetch(`/api/work/sessions/${sessionId}/files/${path}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
  };

  // No session selected — show empty state
  if (!sessionId) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-48px)] bg-gray-50">
        <div className="text-center">
          <p className="text-gray-500 mb-4">No work session selected</p>
          <button
            onClick={() => setShowNewSession(true)}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
          >
            Create New Work Session
          </button>
          {showNewSession && (
            <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
              <div className="bg-white rounded-lg p-6 w-96 shadow-xl">
                <h3 className="text-lg font-semibold mb-4">New Work Session</h3>
                <input
                  className="w-full border rounded px-3 py-2 mb-4 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="Session title..."
                  value={newSessionTitle}
                  onChange={(e) => setNewSessionTitle(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && createSession()}
                  autoFocus
                />
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => setShowNewSession(false)}
                    className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={createSession}
                    className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                  >
                    Create
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-48px)] bg-white">
      {/* Session selector bar */}
      <div className="absolute top-1 left-4 z-10 flex items-center gap-1">
        <select
          value={sessionId || ""}
          onChange={(e) => {
            if (e.target.value) setSearchParams({ session: e.target.value });
          }}
          className="text-xs border rounded px-2 py-1 bg-white"
        >
          {sessions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
            </option>
          ))}
        </select>
        <button
          onClick={() => setShowNewSession(true)}
          className="text-xs text-blue-600 hover:text-blue-800"
        >
          + New
        </button>
      </div>

      {/* Left Panel: Agents + Workspace */}
      <div className="w-64 border-r flex-shrink-0 overflow-hidden pt-8">
        <AgentPanel
          sessionId={sessionId}
          onFileSelect={handleFileSelect}
          selectedFile={activeFile?.path || null}
          onAgentListChange={loadAgents}
        />
      </div>

      {/* Center Panel: Document Editor */}
      <div className="flex-1 overflow-hidden pt-8">
        <DocumentEditor
          content={activeFile?.content || ""}
          filePath={activeFile?.path || null}
          isStreaming={isStreaming}
          onSave={handleSave}
          onContentChange={(content) => {
            if (activeFile) {
              setActiveFile({ ...activeFile, content });
            }
          }}
        />
      </div>

      {/* Right Panel: Chat */}
      <div className="w-80 border-l flex-shrink-0 overflow-hidden pt-8">
        <ChatPanel sessionId={sessionId} agents={agents} />
      </div>

      {/* New session modal (also shown when sessions exist) */}
      {showNewSession && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-96 shadow-xl">
            <h3 className="text-lg font-semibold mb-4">New Work Session</h3>
            <input
              className="w-full border rounded px-3 py-2 mb-4 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="Session title..."
              value={newSessionTitle}
              onChange={(e) => setNewSessionTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createSession()}
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowNewSession(false)}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded"
              >
                Cancel
              </button>
              <button
                onClick={createSession}
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

export default WorkPage;
