import { useState, useEffect, useRef } from "react";
import { useWorkPage } from "@/hooks/useWorkPage";
import { AgentPanel } from "@/components/work/AgentPanel";
import { WorkspacePanel } from "@/components/work/WorkspacePanel";
import { DocumentEditor } from "@/components/work/DocumentEditor";
import { ChatPanel, isPhantomWritePath, type PhaseEvent } from "@/components/work/ChatPanel";

function useMediaQuery(query: string): boolean {
  const [match, setMatch] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(query);
    setMatch(mq.matches);
    const handler = (e: MediaQueryListEvent) => setMatch(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [query]);
  return match;
}

function truncateTitle(text: string, max = 60): string {
  return text.length > max ? text.slice(0, max) + "..." : text;
}

function WelcomePage({ onStart }: { onStart: () => void }) {
  return (
    <div className="flex items-center justify-center h-full bg-[var(--app-bg)]">
      <div className="max-w-md text-center space-y-6 px-8">
        <div className="text-5xl">🖊️</div>
        <h1 className="text-xl font-bold text-[var(--app-text)]">欢迎使用 Smart Work</h1>
        <p className="text-sm leading-relaxed text-[var(--app-text-secondary)]">
          创建 AI 写作 Agent，配置角色和技能，<br />
          然后在工作区中协作完成文档创作。
        </p>
        <button onClick={onStart}
          className="px-6 py-2.5 rounded-xl text-sm font-bold transition-all hover:scale-105"
          style={{ background: "linear-gradient(135deg, var(--app-accent), var(--app-accent-deep))", color: "#1d1c19" }}>
          开始第一个对话
        </button>
      </div>
    </div>
  );
}

export function WorkPage() {
  const {
    sessionId, sessions, agents, loading, loadingTimeout,
    activeFile, isStreaming, setIsStreaming,
    openFile, openExisting, closeFile, updateContent, appendContent, save, rename,
    reloadCounter, setReloadCounter,
    handleCreateSession, handleSelectSession, handleEmptyChange, handleRetry,
    renameSession, deleteSession, createSession, setIsCurrentEmpty,
    setSearchParams, loadAgents,
  } = useWorkPage();

  const isSmallScreen = useMediaQuery("(max-width: 1024px)");
  const [showLeft, setShowLeft] = useState(!isSmallScreen);
  const [showRight, setShowRight] = useState(!isSmallScreen);
  useEffect(() => { setShowLeft(!isSmallScreen); setShowRight(!isSmallScreen); }, [isSmallScreen]);
  const activePathRef = useRef<string | null>(null);
  activePathRef.current = activeFile?.path ?? null;

  if (loading) {
    if (loadingTimeout) {
      return (
        <div className="flex items-center justify-center h-full bg-[var(--app-bg)]">
          <div className="text-center space-y-4">
            <div className="text-3xl">⚠️</div>
            <p className="text-sm text-[var(--app-text-secondary)]">连接超时，请检查服务器是否正常启动</p>
            <button onClick={handleRetry}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-[var(--app-accent-bg)] text-[var(--app-accent)] hover:scale-105 transition-all">
              重试
            </button>
          </div>
        </div>
      );
    }
    return <div className="flex items-center justify-center h-full bg-[var(--app-bg)]"><div className="flex items-center gap-2 text-sm text-[var(--app-text-tertiary)] animate-pulse"><span className="w-1.5 h-1.5 rounded-full bg-[var(--app-accent)]" />正在连接...</div></div>;
  }

  if (sessions.length === 0) {
    return <WelcomePage onStart={handleCreateSession} />;
  }
  if (!sessionId) {
    return <div className="flex items-center justify-center h-full bg-[var(--app-bg)]"><div className="flex items-center gap-2 text-sm text-[var(--app-text-tertiary)] animate-pulse"><span className="w-1.5 h-1.5 rounded-full bg-[var(--app-accent)]" />正在连接...</div></div>;
  }

  return (
    <div className="flex h-full bg-[var(--app-bg)] relative">
      {showLeft && (
      <div className="w-64 flex-shrink-0 flex flex-col overflow-hidden border-r border-[var(--app-border)]">
        <div className="flex flex-col" style={{ flex: "1 1 0", minHeight: 0 }}>
          <div className="overflow-auto" style={{ flex: "1 1 0", minHeight: 0 }}>
            <AgentPanel
              sessionId={sessionId}
              onFileSelect={openFile}
              selectedFile={activeFile?.path || null}
              onAgentListChange={loadAgents}
              reloadTrigger={reloadCounter}
              onCloseFile={closeFile}
              onOpenNewFile={(path) => openFile(path, "", { bypassCache: true })}
              onFileRenamed={rename}
            />
          </div>
          <WorkspacePanel
            sessionId={sessionId}
            onFileSelect={openFile}
            selectedFile={activeFile?.path || null}
            reloadTrigger={reloadCounter}
            onCloseFile={closeFile}
            onOpenNewFile={(path) => openFile(path, "", { bypassCache: true })}
            onFileRenamed={rename}
          />
        </div>
      </div>
      )}
      <EdgeHandle
        side="left"
        open={showLeft}
        onClick={() => setShowLeft(!showLeft)}
        label={showLeft ? "隐藏侧栏" : "显示侧栏"}
      />
      <div className="flex-1 overflow-hidden">
        <DocumentEditor
          key={activeFile?.path || "empty"}
          content={activeFile?.content || ""}
          filePath={activeFile?.path || null}
          isStreaming={isStreaming}
          onSave={(path: string, content: string) => save(path, content, sessionId)}
          onContentChange={updateContent}
          onClose={closeFile}
        />
      </div>
      {showRight && (
      <div className="w-80 flex-shrink-0 overflow-hidden border-l border-[var(--app-border)]">
        <ChatPanel
          key={sessionId}
          sessionId={sessionId}
          agents={agents}
          sessions={sessions}
          onFirstMessage={async (msg: string) => { const s = sessions.find((s: any) => s.id === sessionId); if (s?.title === "新对话") renameSession(sessionId, truncateTitle(msg)); }}
          onCreateSession={handleCreateSession}
          onSelectSession={handleSelectSession}
          onEmptyChange={handleEmptyChange}
          onFocusFile={(path) => { void openExisting(path, sessionId); }}
          onRenameSession={renameSession}
          onDeleteSession={async (id: number) => {
            const s = sessions.find((s) => s.id === id);
            if (!window.confirm(`确定删除对话「${s?.title || id}」？`)) return;
            await deleteSession(id);
            const remaining = sessions.filter((s) => s.id !== id);
            if (id === sessionId) {
              if (remaining.length > 0) setSearchParams({ session: String(remaining[0].id) });
              else {
                const s = await createSession();
                if (s) {
                  setIsCurrentEmpty(true);
                  setSearchParams({ session: String(s.id) });
                }
              }
            }
          }}
          onPhase={(event: PhaseEvent) => {
            if (event.phase !== "write") return;
            const path = String(event.meta?.path || "").trim();
            if (isPhantomWritePath(path)) return;
            const mode = event.meta?.mode as string | undefined;
            if (event.text !== undefined) {
              // 不读闭包里的 activeFile：phase 与首段 delta 常在同一 SSE 块里，此时尚未重渲染
              if (mode === "edit") updateContent(event.text);
              else appendContent(event.text);
            } else {
              if (mode !== "edit" || activePathRef.current !== path) {
                openFile(path, "", { bypassCache: mode !== "edit" });
              }
              setIsStreaming(true);
            }
          }}
          onStreamEnd={() => {
            setIsStreaming(false);
            setReloadCounter((c) => c + 1);
          }}
        />
      </div>
      )}
      <EdgeHandle
        side="right"
        open={showRight}
        onClick={() => setShowRight(!showRight)}
        label={showRight ? "隐藏聊天" : "显示聊天"}
      />
    </div>
  );
}

function EdgeHandle({
  side,
  open,
  onClick,
  label,
}: {
  side: "left" | "right";
  open: boolean;
  onClick: () => void;
  label: string;
}) {
  const collapseLeft = side === "left" ? open : !open;
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className={`absolute top-1/2 z-30 h-10 w-4 flex items-center justify-center text-[var(--app-text-tertiary)] hover:text-[var(--app-text)] hover:bg-[var(--app-accent-bg)] bg-[var(--app-surface)] border border-[var(--app-border)] transition-colors ${
        side === "left"
          ? open
            ? "left-64 -translate-x-1/2 -translate-y-1/2 rounded-md"
            : "left-0 -translate-y-1/2 rounded-r-md border-l-0"
          : open
            ? "right-80 translate-x-1/2 -translate-y-1/2 rounded-md"
            : "right-0 -translate-y-1/2 rounded-l-md border-r-0"
      }`}
    >
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        {collapseLeft
          ? <polyline points="15 18 9 12 15 6" />
          : <polyline points="9 18 15 12 9 6" />}
      </svg>
    </button>
  );
}

export default WorkPage;
