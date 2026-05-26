import { useState, useRef } from "react";

interface SessionBarProps {
  sessions: Array<{ id: number; title: string }>;
  sessionId: number;
  onCreateSession: () => void;
  onSelectSession: (id: number) => void;
  onRenameSession: (id: number, title: string) => void;
  onDeleteSession: (id: number) => void;
}

export function SessionBar({
  sessions, sessionId, onCreateSession, onSelectSession, onRenameSession, onDeleteSession,
}: SessionBarProps) {
  const [show, setShow] = useState(false);
  const [editing, setEditing] = useState<{ id: number; title: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const currentTitle = sessions.find((s) => s.id === sessionId)?.title || "新对话";

  const handleRename = () => {
    if (editing && editing.title.trim()) {
      onRenameSession(editing.id, editing.title.trim());
    }
    setEditing(null);
  };

  return (
    <div className="border-b border-[var(--app-border)]">
      <div className="px-3 py-2 flex items-center gap-2">
        <div className="relative flex-1 min-w-0">
          <button onClick={() => setShow(!show)}
            onDoubleClick={() => { setEditing({ id: sessionId, title: currentTitle }); setTimeout(() => inputRef.current?.select(), 0); }}
            className="flex items-center gap-1.5 w-full h-7 px-2.5 rounded-lg bg-[var(--app-surface)] border border-[var(--app-border)] text-sm font-medium text-[var(--app-text)] truncate hover:border-[var(--app-border-hover)] transition-colors"
            title="双击重命名">
            <span className="truncate flex-1 text-left">{currentTitle}</span>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--app-text-tertiary)" strokeWidth="2.5" strokeLinecap="round" className="shrink-0"
              style={{ transform: show ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}>
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          {show && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setShow(false)} />
              <div className="absolute top-full mt-1 left-0 right-0 z-40 rounded-xl bg-[var(--app-surface)] border border-[var(--app-border)] shadow-xl overflow-hidden"
                style={{ maxHeight: "240px", overflowY: "auto" }}>
                {sessions.map((s) => (
                  <div key={s.id}
                    className="px-3 py-2 text-sm cursor-pointer transition-colors hover:bg-[var(--app-accent-bg)] flex items-center justify-between group"
                    style={{ color: s.id === sessionId ? "var(--app-accent)" : "var(--app-text)" }}
                    onClick={() => { onSelectSession(s.id); setShow(false); }}>
                    <span className="truncate">{s.title}</span>
                    <span className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 shrink-0 ml-2">
                      <button onClick={(e) => { e.stopPropagation(); setEditing({ id: s.id, title: s.title }); setShow(false); }}
                        className="w-5 h-5 rounded-md flex items-center justify-center hover:bg-[var(--app-accent-bg)] transition-colors" title="重命名">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--app-text-secondary)" strokeWidth="2" strokeLinecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); if (confirm("Delete this session?")) onDeleteSession(s.id); }}
                        className="w-5 h-5 rounded-md flex items-center justify-center hover:bg-[var(--app-red-bg)] transition-colors" title="删除">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--app-red)" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                      </button>
                    </span>
                  </div>
                ))}
                <div className="border-t border-[var(--app-border)]" />
                <div onClick={() => { onCreateSession(); setShow(false); }}
                  className="px-3 py-2 text-sm cursor-pointer transition-colors hover:bg-[var(--app-accent-bg)] text-[var(--app-accent)] font-medium flex items-center gap-2">
                  <span className="text-base leading-none">+</span> 新对话
                </div>
              </div>
            </>
          )}
        </div>
        <button onClick={onCreateSession}
          className="w-6 h-6 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-200 hover:scale-110 shrink-0 border border-[var(--app-accent-border)] text-[var(--app-accent)] hover:bg-[var(--app-accent-bg)] leading-none"
          title="新对话">+</button>

        {editing !== null && (
          <div className="fixed inset-0 z-50" onClick={handleRename} />
        )}
      </div>
      {editing !== null && (
        <div className="px-3 pb-2">
          <input ref={inputRef} value={editing.title}
            onChange={(e) => setEditing({ ...editing, title: e.target.value })}
            onBlur={handleRename}
            onKeyDown={(e) => { if (e.key === "Enter") handleRename(); if (e.key === "Escape") setEditing(null); }}
            className="w-full h-8 px-3 rounded-xl bg-[var(--app-surface)] border border-[var(--app-accent)] text-sm outline-none text-[var(--app-text)]"
            autoFocus />
        </div>
      )}
    </div>
  );
}

export default SessionBar;
