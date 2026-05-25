import { useEffect, useRef } from "react";
import { Crepe } from "@milkdown/crepe";
import { replaceAll } from "@milkdown/utils";
import "@milkdown/crepe/theme/common/style.css";
import "@milkdown/crepe/theme/nord.css";

export interface DocumentEditorProps {
  content: string;
  filePath: string | null;
  isStreaming: boolean;
  onSave: (path: string, content: string) => void;
  onContentChange: (content: string) => void;
}

export function DocumentEditor({
  content, filePath, isStreaming, onSave, onContentChange,
}: DocumentEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const crepeRef = useRef<Crepe | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isInternalChangeRef = useRef(false);

  const onSaveRef = useRef(onSave); onSaveRef.current = onSave;
  const onContentChangeRef = useRef(onContentChange); onContentChangeRef.current = onContentChange;
  const filePathRef = useRef(filePath); filePathRef.current = filePath;

  useEffect(() => {
    if (!containerRef.current || crepeRef.current) return;
    const crepe = new Crepe({
      root: containerRef.current,
      defaultValue: content || "",
    });
    crepe.create().then(() => {
      crepeRef.current = crepe;
      crepe.on((listener) => {
        listener.markdownUpdated((_ctx, md) => {
          isInternalChangeRef.current = true;
          onContentChangeRef.current(md);
          const fp = filePathRef.current;
          if (fp && md) {
            if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
            saveTimerRef.current = setTimeout(() => onSaveRef.current(fp, md), 2000);
          }
        });
      });
    });
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      crepeRef.current?.destroy(); crepeRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (isInternalChangeRef.current) { isInternalChangeRef.current = false; return; }
    if (!crepeRef.current) return;
    const currentMd = crepeRef.current.getMarkdown();
    if (content !== currentMd) crepeRef.current.editor.action(replaceAll(content));
    if (isStreaming && filePath && content) {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => onSave(filePath, content), 2000);
    }
  }, [content, filePath, isStreaming, onSave]);

  useEffect(() => {
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, []);

  const displayName = filePath ? filePath.split("/").pop() || filePath : null;

  if (!filePath) {
    return (
      <div className="flex items-center justify-center h-full bg-[var(--app-bg)]">
        <div className="text-center animate-pageIn">
          <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center border border-[var(--app-border)]"
            style={{ background: "rgba(255,255,255,0.02)" }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--app-text-tertiary)" strokeWidth="1.2" strokeLinecap="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
            </svg>
          </div>
          <p className="text-sm font-medium text-[var(--app-text-tertiary)]">Select a file to edit</p>
          <p className="text-xs mt-1 text-[var(--app-border)]">Choose from the agent panel</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[var(--app-bg)]">
      {/* File header */}
      <div className="flex items-center justify-between px-5 py-2.5 border-b border-[var(--app-border)] bg-[var(--app-surface)]">
        <div className="flex items-center gap-2.5 min-w-0">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--app-accent)" strokeWidth="2" strokeLinecap="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
          </svg>
          <span className="text-xs font-medium truncate text-[var(--app-text-secondary)]">{filePath}</span>
        </div>
        {displayName && (
          <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-md flex-shrink-0 ml-3 bg-[var(--app-accent-bg)] border border-[var(--app-accent-border)] text-[var(--app-accent)]">
            {displayName.endsWith(".md") ? "Markdown" : displayName.split(".").pop()?.toUpperCase() || "File"}
          </span>
        )}
      </div>

      {/* Streaming indicator */}
      {isStreaming && (
        <div className="flex items-center gap-2.5 px-5 py-2 text-xs font-medium bg-[var(--app-accent-bg)] border-b border-[var(--app-accent-border)] text-[var(--app-accent)]">
          <span className="flex gap-1">
            <span className="w-1 h-1 rounded-full animate-bounce bg-[var(--app-accent)]" style={{ animationDelay: "0ms" }} />
            <span className="w-1 h-1 rounded-full animate-bounce bg-[var(--app-accent)]" style={{ animationDelay: "150ms" }} />
            <span className="w-1 h-1 rounded-full animate-bounce bg-[var(--app-accent)]" style={{ animationDelay: "300ms" }} />
          </span>
          Agent is writing...
        </div>
      )}

      {/* Editor area with paper-like surface */}
      <div className="flex-1 overflow-auto bg-[var(--app-bg)]">
        <div className="max-w-3xl mx-auto my-6 rounded-xl shadow-2xl overflow-hidden bg-white" style={{ minHeight: "calc(100% - 3rem)" }}>
          <div ref={containerRef} className="milkdown px-12 py-10 text-neutral-900" />
        </div>
      </div>
    </div>
  );
}

export default DocumentEditor;
