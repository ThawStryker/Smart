import { useState, useEffect } from "react";
import { useWorkPage } from "@/hooks/useWorkPage";
import { AgentPanel } from "@/components/work/AgentPanel";
import { WorkspacePanel } from "@/components/work/WorkspacePanel";
import { DocumentEditor } from "@/components/work/DocumentEditor";
import { ChatPanel, type PhaseEvent } from "@/components/work/ChatPanel";

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
        <div className="flex flex-col items-center gap-3">
          <div className="flex items-center gap-2 text-xs text-[var(--app-text-tertiary)]">
            <span className="w-6 h-6 rounded-full bg-[var(--app-accent-bg)] text-[var(--app-accent)] flex items-center justify-center font-bold text-sm">1</span>
            在左侧创建一个 Agent
          </div>
          <div className="flex items-center gap-2 text-xs text-[var(--app-text-tertiary)]">
            <span className="w-6 h-6 rounded-full bg-[var(--app-accent-bg)] text-[var(--app-accent)] flex items-center justify-center font-bold text-sm">2</span>
            在 AGENTS.md 中定义它的角色
          </div>
          <div className="flex items-center gap-2 text-xs text-[var(--app-text-tertiary)]">
            <span className="w-6 h-6 rounded-full bg-[var(--app-accent-bg)] text-[var(--app-accent)] flex items-center justify-center font-bold text-sm">3</span>
            在聊天框输入 <code className="px-1 py-0.5 rounded bg-[var(--app-surface)]">@Agent名 帮我写...</code>
          </div>
        </div>
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
    openFile, closeFile, updateContent, appendContent, save,
    reloadCounter, setReloadCounter,
    handleCreateSession, handleRetry,
    renameSession, deleteSession, createSession,
    setSearchParams,
  } = useWorkPage();

  const isSmallScreen = useMediaQuery("(max-width: 1024px)");
  const [showLeft, setShowLeft] = useState(!isSmallScreen);
  const [showRight, setShowRight] = useState(!isSmallScreen);
  useEffect(() => { setShowLeft(!isSmallScreen); setShowRight(!isSmallScreen); }, [isSmallScreen]);

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

  if (sessions.length === 0 || !sessionId) {
    return <WelcomePage onStart={handleCreateSession} />;
  }

  return (
    <div className="flex h-full bg-[var(--app-bg)] relative">
      {isSmallScreen && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-30 flex gap-2">
          <button onClick={() => setShowLeft(!showLeft)}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-bold shadow-lg bg-[var(--app-surface)] border border-[var(--app-border)] text-[var(--app-text-secondary)] hover:bg-[var(--app-accent-bg)] transition-colors"
            title={showLeft ? "隐藏侧栏" : "显示侧栏"}>
            {showLeft ? "◀" : "▶"}
          </button>
          <button onClick={() => setShowRight(!showRight)}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-bold shadow-lg bg-[var(--app-surface)] border border-[var(--app-border)] text-[var(--app-text-secondary)] hover:bg-[var(--app-accent-bg)] transition-colors"
            title={showRight ? "隐藏聊天" : "显示聊天"}>
            💬
          </button>
        </div>
      )}

      {showLeft && (
      <div className="w-64 flex-shrink-0 flex flex-col overflow-hidden border-r border-[var(--app-border)]">
        <div className="flex flex-col" style={{ flex: "1 1 0", minHeight: 0 }}>
          <div className="overflow-auto" style={{ flex: "1 1 0", minHeight: 0 }}>
            <AgentPanel
              sessionId={sessionId}
              onFileSelect={openFile}
              selectedFile={activeFile?.path || null}
              onAgentListChange={() => {}}
              reloadTrigger={reloadCounter}
              onCloseFile={closeFile}
            />
          </div>
          <WorkspacePanel
            sessionId={sessionId}
            onFileSelect={openFile}
            selectedFile={activeFile?.path || null}
            reloadTrigger={reloadCounter}
            onCloseFile={closeFile}
          />
        </div>
      </div>
      )}
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
          onSelectSession={(id: number) => setSearchParams({ session: String(id) })}
          onRenameSession={renameSession}
          onDeleteSession={async (id: number) => {
            const s = sessions.find((s) => s.id === id);
            if (!window.confirm(`确定删除对话「${s?.title || id}」？`)) return;
            await deleteSession(id);
            const remaining = sessions.filter((s) => s.id !== id);
            if (id === sessionId) {
              if (remaining.length > 0) setSearchParams({ session: String(remaining[0].id) });
              else { const s = await createSession(); if (s) setSearchParams({ session: String(s.id) }); }
            }
          }}
          onPhase={(event: PhaseEvent) => {
            if (event.phase === "write" && event.meta?.path) {
              const path = event.meta.path as string;
              if (event.text !== undefined) {
                if (activeFile && activeFile.path === path) appendContent(event.text);
              } else {
                openFile(path, "");
                setIsStreaming(true);
              }
            }
          }}
          onStreamEnd={() => {
            setIsStreaming(false);
            setReloadCounter((c) => c + 1);
          }}
        />
      </div>
      )}
    </div>
  );
}

export default WorkPage;
