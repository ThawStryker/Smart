import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useSessions, useAgents, useFiles, useActiveFile } from "@/hooks";
import { AgentPanel, DocumentEditor, ChatPanel } from "@/modules";

function truncateTitle(text: string, max = 30): string {
  return text.length > max ? text.slice(0, max) + "..." : text;
}

export function WorkPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const sessionId = parseInt(searchParams.get("session") || "0");

  const { sessions, loading, load: loadSessions, create: createSession, rename: renameSession, remove: deleteSession } = useSessions();
  const { agents, load: loadAgents } = useAgents();
  const { load: loadFiles } = useFiles(sessionId);
  const { activeFile, isStreaming, setIsStreaming, open: openFile, close: closeFile, updateContent, save } = useActiveFile();

  const [reloadCounter, setReloadCounter] = useState(0);

  useEffect(() => { loadSessions(); loadAgents(); }, [loadSessions, loadAgents]);

  useEffect(() => {
    if (loading) return;
    if (sessions.length === 0) {
      createSession().then((s: any) => { if (s) setSearchParams({ session: String(s.id) }); });
      return;
    }
    const exists = sessions.some((s: any) => s.id === sessionId);
    if (!sessionId || !exists) setSearchParams({ session: String(sessions[0].id) });
  }, [loading, sessions, sessionId, createSession, setSearchParams]);

  useEffect(() => { if (sessionId) loadFiles(); }, [sessionId, loadFiles]);
  useEffect(() => { if (reloadCounter && sessionId) loadFiles(); }, [reloadCounter, sessionId, loadFiles]);

  const handleCreateSession = async () => { const s = await createSession(); if (s) setSearchParams({ session: String(s.id) }); };

  if (loading || !sessionId) return <div className="flex items-center justify-center h-full bg-[var(--app-bg)]"><div className="flex items-center gap-2 text-sm text-[var(--app-text-tertiary)] animate-pulse"><span className="w-1.5 h-1.5 rounded-full bg-[var(--app-accent)]" />Loading...</div></div>;

  return (
    <div className="flex h-full bg-[var(--app-bg)]">
      <div className="w-64 flex-shrink-0 flex flex-col overflow-hidden border-r border-[var(--app-border)]">
        <AgentPanel
          sessionId={sessionId}
          onFileSelect={openFile}
          selectedFile={activeFile?.path || null}
          onAgentListChange={loadAgents}
          reloadTrigger={reloadCounter}
        />
      </div>
      <div className="flex-1 overflow-hidden">
        <DocumentEditor
          content={activeFile?.content || ""}
          filePath={activeFile?.path || null}
          isStreaming={isStreaming}
          onSave={(path: string, content: string) => save(path, content, sessionId)}
          onContentChange={updateContent}
          onClose={closeFile}
        />
      </div>
      <div className="w-80 flex-shrink-0 overflow-hidden border-l border-[var(--app-border)]">
        <ChatPanel
          key={sessionId}
          sessionId={sessionId}
          agents={agents}
          sessions={sessions}
          onFirstMessage={async (msg: string) => { const s = sessions.find((s: any) => s.id === sessionId); if (s?.title === "新对话") renameSession(sessionId, truncateTitle(msg)); }}
          onCreateSession={handleCreateSession}
          onSelectSession={(id: number) => setSearchParams({ session: String(id) })}
          onRenameSession={renameSession}
          onDeleteSession={async (id: number) => {
            await deleteSession(id);
            const remaining = sessions.filter((s) => s.id !== id);
            if (id === sessionId) {
              if (remaining.length > 0) setSearchParams({ session: String(remaining[0].id) });
              else { const s = await createSession(); if (s) setSearchParams({ session: String(s.id) }); }
            }
          }}
          onOpenFile={(path: string) => { openFile(path, ""); setIsStreaming(true); }}
          onDocDelta={(path: string, delta: string) => { if (activeFile && activeFile.path === path) updateContent((activeFile.content || "") + delta); }}
          onStreamEnd={() => { setIsStreaming(false); setReloadCounter((c) => c + 1); }}
        />
      </div>
    </div>
  );
}

export default WorkPage;
