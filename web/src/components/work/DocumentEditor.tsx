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

const S = {
  bg: "#1d1c19",
  paperBg: "#faf8f5",
  panel: "#252422",
  border: "#2e2d2a",
  text: "#1d1c19",
  textDim: "#6b6660",
  accent: "#f59e0b",
  accentDeep: "#d97706",
  streamBg: "rgba(245,158,11,0.1)",
  streamBorder: "rgba(245,158,11,0.15)",
};

export function DocumentEditor({
  content,
  filePath,
  isStreaming,
  onSave,
  onContentChange,
}: DocumentEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const crepeRef = useRef<Crepe | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isInternalChangeRef = useRef(false);

  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  const onContentChangeRef = useRef(onContentChange);
  onContentChangeRef.current = onContentChange;
  const filePathRef = useRef(filePath);
  filePathRef.current = filePath;

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
      crepeRef.current?.destroy();
      crepeRef.current = null;
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

  // File header showing current path
  const displayName = filePath ? filePath.split("/").pop() || filePath : null;

  if (!filePath) {
    return (
      <div className="flex items-center justify-center h-full" style={{ background: "#1a1917" }}>
        <div className="text-center" style={{ animation: "pageIn 0.4s ease" }}>
          <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center"
            style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)" }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={S.textDim} strokeWidth="1.2" strokeLinecap="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
            </svg>
          </div>
          <p className="text-sm font-medium" style={{ color: "#5c5852" }}>Select a file to edit</p>
          <p className="text-xs mt-1" style={{ color: "#3d3a35" }}>Choose from the agent panel</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full" style={{ background: S.bg }}>
      {/* File header */}
      <div className="flex items-center justify-between px-5 py-2.5" style={{ borderBottom: `1px solid ${S.border}`, background: S.panel }}>
        <div className="flex items-center gap-2.5 min-w-0">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={S.accent} strokeWidth="2" strokeLinecap="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          <span className="text-xs font-medium truncate" style={{ color: S.textDim }}>{filePath}</span>
        </div>
        {displayName && (
          <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-md flex-shrink-0 ml-3"
            style={{ color: S.accent, background: S.streamBg, border: `1px solid ${S.streamBorder}` }}>
            {displayName.endsWith(".md") ? "Markdown" : displayName.split(".").pop()?.toUpperCase() || "File"}
          </span>
        )}
      </div>

      {/* Streaming indicator */}
      {isStreaming && (
        <div className="flex items-center gap-2.5 px-5 py-2 text-xs font-medium"
          style={{ background: S.streamBg, borderBottom: `1px solid ${S.streamBorder}`, color: S.accent }}>
          <span className="flex gap-1">
            <span className="w-1 h-1 rounded-full animate-bounce" style={{ background: S.accent, animationDelay: "0ms" }} />
            <span className="w-1 h-1 rounded-full animate-bounce" style={{ background: S.accent, animationDelay: "150ms" }} />
            <span className="w-1 h-1 rounded-full animate-bounce" style={{ background: S.accent, animationDelay: "300ms" }} />
          </span>
          Agent is writing...
        </div>
      )}

      {/* Editor: cream paper surface with dark surroundings */}
      <div className="flex-1 overflow-auto" style={{ background: "#1a1917" }}>
        <div className="max-w-3xl mx-auto my-6 rounded-xl shadow-2xl overflow-hidden"
          style={{ background: S.paperBg, minHeight: "calc(100% - 3rem)" }}>
          <div ref={containerRef} className="milkdown px-12 py-10" style={{ color: S.text }} />
        </div>
      </div>
    </div>
  );
}

export default DocumentEditor;
