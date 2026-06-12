import { useRef } from "react";

interface MentionInputProps {
  input: string;
  onInputChange: (value: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  agents: string[];
  showMentions: boolean;
  mentionFilter: string;
  mentionIndex: number;
  streamActive: boolean;
  onSend: () => void;
  onStop: () => void;
  onInsertMention: (name: string) => void;
}

export function MentionInput({ input, onInputChange, onKeyDown, agents, showMentions, mentionFilter, mentionIndex, streamActive, onSend, onStop, onInsertMention }: MentionInputProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const filteredMentions = agents.filter((a) => a.toLowerCase().startsWith(mentionFilter.toLowerCase()));

  return (
    <div className="border-t border-[var(--app-border)]">
      {showMentions && filteredMentions.length > 0 && (
        <div className="mx-3 mt-2 rounded-xl overflow-hidden shadow-lg bg-[var(--app-surface)] border border-[var(--app-border)] max-h-48 overflow-y-auto">
          {filteredMentions.map((agent, i) => (
            <div key={agent} className="px-3 py-2 text-sm cursor-pointer transition-colors flex items-center gap-2"
              style={{ background: i === mentionIndex ? "rgba(255,255,255,0.04)" : "transparent", color: i === mentionIndex ? "var(--app-accent)" : "var(--app-text-secondary)" }}
              onMouseDown={(e) => { e.preventDefault(); onInsertMention(agent); }}>
              <span className="text-xs font-mono font-bold text-[var(--app-accent)]">@</span>{agent}
            </div>
          ))}
        </div>
      )}
      <div className="p-3">
        <div className="relative">
          <textarea ref={inputRef} value={input}
            onChange={(e) => onInputChange(e.target.value)} onKeyDown={onKeyDown}
            placeholder="Message Yumi or @mention an agent..."
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
