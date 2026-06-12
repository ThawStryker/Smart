import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const agentAvatars = ["🐱","🐶","🦊","🐼","🐨","🐯","🦁","🐸","🐵","🐰","🐻","🦄","🐙","🦋","🐞","🐣","🦉","🐳","🦀","🐲"];
export function getAvatar(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  return agentAvatars[Math.abs(hash) % agentAvatars.length];
}

export type PhaseName = "thinking" | "agent_start" | "agent_done" | "read" | "memory" | "skill" | "search" | "write" | "text";

export interface PhaseCard {
  key: string;
  phase: PhaseName;
  meta?: Record<string, unknown>;
  content: string;
}

export const phaseDisplay: Record<string, { icon: string; label: string }> = {
  thinking: { icon: "💭", label: "Thinking" },
  agent_start: { icon: "🤖", label: "" },
  read: { icon: "📖", label: "Read" },
  memory: { icon: "🧠", label: "Memory" },
  skill: { icon: "🎯", label: "Skill" },
  search: { icon: "🔍", label: "Search" },
  write: { icon: "✍️", label: "Writing" },
};

export function getPhaseLabel(phase: PhaseName, meta?: Record<string, unknown>): string {
  const display = phaseDisplay[phase];
  if (!display) return phase;
  if (phase === "agent_start" && meta?.agentName) return `🤖 ${meta.agentName}`;
  if (phase === "read" && meta?.path) {
    const file = (meta.path as string).split("/").pop() || meta.path;
    return `Read ${file}`;
  }
  if (phase === "write" && meta?.path) {
    const file = (meta.path as string).split("/").pop() || meta.path;
    return `Write ${file}`;
  }
  if (phase === "search" && meta?.query) return `${meta.query}`;
  if (phase === "skill" && meta?.name) return `${meta.name}`;
  if (phase === "memory" && meta?.entry) return `${meta.entry}`;
  return display.label;
}

export function MarkdownContent({ content }: { content: string }) {
  if (!content) return null;
  return (
    <div className="markdown-body">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>
        {content}
      </ReactMarkdown>
    </div>
  );
}

interface StreamingMessageProps {
  streamAgent: string | null;
  streamText: string;
  streamThinking: string;
  phaseCards: PhaseCard[];
  streamActive: boolean;
  hasCards: boolean;
  thinkingOpen: boolean;
  onToggleThinking: () => void;
}

export function StreamingMessage({ streamAgent, streamText, streamThinking, phaseCards, streamActive, hasCards, thinkingOpen, onToggleThinking }: StreamingMessageProps) {
  if (!streamActive && !streamText && !streamThinking) return null;
  const hasThinking = streamThinking !== "" || phaseCards.some(c => c.phase === "thinking");

  return (
    <div className="animate-pageIn">
      <div className="flex items-center gap-2 mb-1">
        {streamAgent && <span className="text-sm leading-none">{getAvatar(streamAgent)}</span>}
        <span className="text-xs font-bold uppercase tracking-wider" style={{ color: streamAgent ? "#a78bfa" : "var(--app-text-secondary)" }}>
          {streamAgent || "Yumi"}
        </span>
      </div>
      {hasThinking && (
        <div className="ml-3 mb-0.5">
          <div className="flex items-center gap-1 cursor-pointer select-none" onClick={onToggleThinking}>
            <span className="text-xs opacity-60">💭</span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--app-text-tertiary)]">Thinking</span>
            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="var(--app-text-tertiary)" strokeWidth="3" style={{ transform: thinkingOpen ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform 0.15s" }}>
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </div>
          {thinkingOpen && (
            <div className="mt-1 ml-4 text-xs leading-relaxed whitespace-pre-wrap text-[var(--app-text-secondary)]">
              {streamThinking}
            </div>
          )}
        </div>
      )}
      {(streamActive || phaseCards.length > 0) && hasCards && phaseCards.map((card) => {
        if (card.phase === "thinking") return null;
        const label = getPhaseLabel(card.phase, card.meta);
        return (
          <div key={card.key} className="animate-pageIn flex items-center gap-2 py-1 pl-1 ml-3">
            <span className="text-xs">{phaseDisplay[card.phase]?.icon || "🔧"}</span>
            <span className="text-xs text-[var(--app-text-secondary)]">{label}</span>
          </div>
        );
      })}
      <div className="text-sm leading-relaxed whitespace-pre-wrap text-[var(--app-text)]">
        {streamText ? <MarkdownContent content={streamText} /> : (streamActive ? <span className="text-[var(--app-text-tertiary)]">...</span> : "")}
      </div>
    </div>
  );
}
