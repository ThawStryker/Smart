import type { MentionKind } from "@/lib/mention";
import { fileLabel } from "@/lib/mention";

interface MentionInputProps {
  input: string;
  onInputChange: (value: string, cursor: number | null) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  agents: string[];
  files: string[];
  showMentions: boolean;
  mentionKind: MentionKind | null;
  mentionFilter: string;
  mentionIndex: number;
  streamActive: boolean;
  onSend: () => void;
  onStop: () => void;
  onInsertMention: (name: string) => void;
}

export function MentionInput({
  input, onInputChange, onKeyDown, inputRef, agents, files, showMentions, mentionKind,
  mentionFilter, mentionIndex, streamActive, onSend, onStop, onInsertMention,
}: MentionInputProps) {
  const items = mentionKind === "file"
    ? files.filter((f) => f.toLowerCase().includes(mentionFilter.toLowerCase()))
    : agents.filter((a) => a.toLowerCase().includes(mentionFilter.toLowerCase()));
  const mark = mentionKind === "file" ? "#" : "@";

  return (
    <div className="border-t border-[var(--app-border)]">
      {showMentions && (
        <div role="listbox" className="mx-3 mt-2 rounded-xl overflow-hidden shadow-lg bg-[var(--app-surface)] border border-[var(--app-border)] max-h-48 overflow-y-auto">
          {items.length === 0 ? (
            <div className="px-3 py-2 text-sm text-[var(--app-text-tertiary)]">
              {mentionKind === "file" ? "工作区暂无匹配文档" : "没有匹配的 Agent"}
            </div>
          ) : items.map((name, i) => (
            <div key={name} role="option" className="px-3 py-2 text-sm cursor-pointer transition-colors flex items-center gap-2"
              style={{ background: i === mentionIndex ? "rgba(255,255,255,0.04)" : "transparent", color: i === mentionIndex ? "var(--app-accent)" : "var(--app-text-secondary)" }}
              onMouseDown={(e) => { e.preventDefault(); onInsertMention(name); }}>
              <span className="text-xs font-mono font-bold text-[var(--app-accent)]">{mark}</span>
              {mentionKind === "file" ? fileLabel(name) : name}
              {mentionKind === "file" && name.includes("/") && (
                <span className="text-[10px] truncate text-[var(--app-text-tertiary)]">{name}</span>
              )}
            </div>
          ))}
        </div>
      )}
      <div className="p-3">
        <div className="relative">
          <textarea ref={inputRef} value={input}
            onChange={(e) => onInputChange(e.target.value, e.target.selectionStart)} onKeyDown={onKeyDown}
            placeholder="@Agent 或 #文档"
            className="w-full rounded-xl px-4 py-3 pr-12 text-sm resize-none outline-none transition-all duration-200 bg-[var(--app-surface)] border border-[var(--app-border)] text-[var(--app-text)] overflow-y-auto [scrollbar-gutter:stable]"
            style={{ height: "80px" }}
            rows={3} disabled={streamActive} />
          <button onClick={streamActive ? onStop : onSend}
            disabled={!streamActive && !input.trim()}
            className="absolute right-3 bottom-3 w-8 h-8 rounded-full flex items-center justify-center shadow-sm hover:shadow-md transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: "linear-gradient(135deg, var(--app-accent), var(--app-accent-deep))", color: "#1d1c19" }}>
            {streamActive ? "■" : "➤"}
          </button>
        </div>
      </div>
    </div>
  );
}
