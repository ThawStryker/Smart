import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { useWorkSession } from "@/hooks/useWorkSession";
import type { WorkSession } from "@/types/work";
import { AgentPanel } from "@/components/work/AgentPanel";
import { DocumentEditor } from "@/components/work/DocumentEditor";
import { ChatPanel } from "@/components/work/ChatPanel";

function truncateTitle(text: string, max = 30): string {
  return text.length > max ? text.slice(0, max) + "..." : text;
}

export function WorkPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const sessionId = parseInt(searchParams.get("session") || "0");
  const { sessions, loading, createSession, renameSession, deleteSession: hookDeleteSession } = useWorkSession();
  const [activeFile, setActiveFile] = useState<{ path: string; content: string } | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [agents, setAgents] = useState<string[]>([]);

  // Init: if no sessions exist, create one; if invalid sessionId, redirect to first
  useEffect(() => {
    if (loading) return;
    if (sessions.length === 0) {
      createSession().then((s) => {
        if (s) setSearchParams({ session: String(s.id) });
      });
      return;
    }
    const exists = sessions.some((s: WorkSession) => s.id === sessionId);
    if (!sessionId || !exists) {
      setSearchParams({ session: String(sessions[0].id) });
    }
  }, [loading, sessions, sessionId, createSession, setSearchParams]);

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

  useEffect(() => { loadAgents(); }, [loadAgents]);

  const deleteSession = async (id: number) => {
    await hookDeleteSession(id);
    const remaining = sessions.filter((x) => x.id !== id);
    if (id === sessionId) {
      if (remaining.length > 0) {
        setSearchParams({ session: String(remaining[0].id) });
      } else {
        // Last session deleted — create a new empty one
        const s = await createSession();
        if (s) setSearchParams({ session: String(s.id) });
      }
    }
  };

  const handleCreateSession = async () => {
    // If current session is empty (default title), don't create a new one
    const current = sessions.find((s) => s.id === sessionId);
    if (current?.title === "新对话") return;
    const s = await createSession();
    if (s) setSearchParams({ session: String(s.id) });
  };

  const handleFirstMessage = useCallback(async (message: string) => {
    if (!sessionId) return;
    const current = sessions.find((s) => s.id === sessionId);
    if (current?.title === "新对话") {
      await renameSession(sessionId, truncateTitle(message));
    }
  }, [sessionId, sessions, renameSession]);

  const handleFileSelect = (path: string, content: string) => {
    setActiveFile({ path, content }); setIsStreaming(false);
  };

  const handleSave = async (path: string, content: string) => {
    await fetch(`/api/work/sessions/${sessionId}/files/${path}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
  };

  // Active sessions: exclude empty "新对话" sessions unless they are the current one
  const activeSessions = sessions.filter((s) => s.title !== "新对话" || s.id === sessionId);

  if (loading || !sessionId) {
    return (
      <div className="flex items-center justify-center h-full bg-[var(--app-bg)]">
        <div className="flex items-center gap-2 text-sm text-[var(--app-text-tertiary)] animate-pulse">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--app-accent)]" />
          Loading...
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full bg-[var(--app-bg)]">
      <div className="w-64 flex-shrink-0 flex flex-col overflow-hidden border-r border-[var(--app-border)]">
        <AgentPanel sessionId={sessionId} onFileSelect={handleFileSelect} selectedFile={activeFile?.path || null} onAgentListChange={loadAgents} />
      </div>
      <div className="flex-1 overflow-hidden">
        <DocumentEditor content={activeFile?.content || ""} filePath={activeFile?.path || null} isStreaming={isStreaming} onSave={handleSave}
          onContentChange={(content) => { if (activeFile) setActiveFile({ ...activeFile, content }); }} />
      </div>
      <div className="w-80 flex-shrink-0 overflow-hidden border-l border-[var(--app-border)]">
        <ChatPanel
          sessionId={sessionId}
          agents={agents}
          sessions={activeSessions}
          onFirstMessage={handleFirstMessage}
          onCreateSession={handleCreateSession}
          onSelectSession={(id) => setSearchParams({ session: String(id) })}
          onRenameSession={renameSession}
          onDeleteSession={deleteSession}
        />
      </div>
    </div>
  );
}

export default WorkPage;
