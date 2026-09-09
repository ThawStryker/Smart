import { useState } from "react";
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
  thinking: { icon: "💭", label: "Think" },
  agent_start: { icon: "🤖", label: "" },
  read: { icon: "📖", label: "Read" },
  memory: { icon: "🧠", label: "Memory" },
  skill: { icon: "🎯", label: "Skill" },
  search: { icon: "🔍", label: "Search" },
  write: { icon: "✍️", label: "Write" },
};

function fileName(path?: unknown): string {
  const p = String(path || "");
  if (!p) return "";
  return p.split("/").pop() || p;
}

function previewText(text: string, n = 88): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return "…";
  return t.length > n ? t.slice(0, n) + "…" : t;
}

export function getPhaseLabel(phase: PhaseName, meta?: Record<string, unknown>): string {
  const display = phaseDisplay[phase];
  if (!display) return phase;
  if (phase === "agent_start" && meta?.agentName) return `🤖 ${meta.agentName}`;
  if (phase === "read" && meta?.tool === "list_files") return `List ${String(meta.path || meta.prefix || "/")}`;
  if (phase === "read" && meta?.path) return `Read ${fileName(meta.path)}`;
  if (phase === "write" && meta?.path) {
    const tag = meta.mode === "edit" ? "Edit" : "Write";
    return `${tag} ${fileName(meta.path)}`;
  }
  if (phase === "search" && meta?.query) return `${meta.query}`;
  if (phase === "skill" && meta?.name) return `${meta.name}`;
  if (phase === "memory" && (meta?.entry || meta?.path)) return String(meta.entry || meta.path);
  return display.label;
}

type DshKind = "thinking" | "read" | "list" | "write" | "edit" | "skill" | "memory" | "search" | "text";

function dshFromCard(card: PhaseCard): { kind: DshKind; tag: string; detail: string; isPath: boolean; extra: string } {
  const meta = card.meta || {};
  const extra = String(meta.error || "");
  if (card.phase === "thinking") {
    return { kind: "thinking", tag: "Think", detail: previewText(card.content || ""), isPath: false, extra };
  }
  if (card.phase === "read" && meta.tool === "list_files") {
    return { kind: "list", tag: "List", detail: String(meta.path || meta.prefix || "/"), isPath: true, extra };
  }
  if (card.phase === "read") {
    return { kind: "read", tag: "Read", detail: String(meta.path || fileName(meta.path) || ""), isPath: true, extra };
  }
  if (card.phase === "write" && meta.mode === "edit") {
    return { kind: "edit", tag: "Edit", detail: String(meta.path || ""), isPath: true, extra };
  }
  if (card.phase === "write") {
    return { kind: "write", tag: "Write", detail: String(meta.path || ""), isPath: true, extra };
  }
  if (card.phase === "skill") {
    return { kind: "skill", tag: "Skill", detail: String(meta.name || ""), isPath: false, extra };
  }
  if (card.phase === "memory") {
    return { kind: "memory", tag: "Memory", detail: String(meta.path || meta.entry || "memory/MEMORY.md"), isPath: true, extra };
  }
  if (card.phase === "search") {
    return { kind: "search", tag: "Search", detail: String(meta.query || card.content || ""), isPath: false, extra };
  }
  return { kind: "text", tag: "Note", detail: previewText(card.content || ""), isPath: false, extra };
}

function DshIcon({ kind }: { kind: DshKind }) {
  const common = { viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.4, className: "w-3.5 h-3.5" };
  if (kind === "thinking") {
    return (
      <svg {...common}>
        <circle cx="8" cy="8" r="2.2" />
        <circle cx="8" cy="8" r="5.2" strokeDasharray="2 2" opacity="0.7" />
        <circle cx="8" cy="3" r="1" fill="currentColor" stroke="none" />
        <circle cx="12.5" cy="10.5" r="1" fill="currentColor" stroke="none" />
        <circle cx="3.5" cy="10.5" r="1" fill="currentColor" stroke="none" />
      </svg>
    );
  }
  if (kind === "read") {
    return (
      <svg {...common}>
        <path d="M3.5 2.5h6.5l3 3V13.5h-9.5z" />
        <path d="M10 2.5V5.5h3" />
      </svg>
    );
  }
  if (kind === "list" || kind === "search") {
    return (
      <svg {...common}>
        <circle cx="7" cy="7" r="4" />
        <path d="M10.2 10.2L13.5 13.5" />
      </svg>
    );
  }
  if (kind === "write" || kind === "edit") {
    return (
      <svg {...common}>
        <path d="M3.5 12.5l.8-3.2L11.8 2l2.2 2.2-7.5 7.5z" />
        <path d="M3.5 12.5H13" />
      </svg>
    );
  }
  if (kind === "skill") {
    return (
      <svg {...common}>
        <circle cx="8" cy="8" r="2" />
        <circle cx="8" cy="8" r="5.5" />
        <path d="M8 2.5v2M8 11.5v2M2.5 8h2M11.5 8h2" />
      </svg>
    );
  }
  if (kind === "memory") {
    return (
      <svg {...common}>
        <rect x="3.5" y="2.5" width="9" height="11" rx="1" />
        <path d="M6 5.5h4M6 8h4M6 10.5h2" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <circle cx="8" cy="8" r="5.5" />
    </svg>
  );
}

export function MarkdownContent({ content }: { content: string }) {
  if (!content) return null;
  const normalized = content.replace(/\n{3,}/g, "\n\n");
  return (
    <div className="markdown-body">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>
        {normalized}
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

export function StreamingMessage({ streamAgent, streamText, phaseCards, streamActive, hasCards }: StreamingMessageProps) {
  const [openThink, setOpenThink] = useState<Record<string, boolean>>({});
  if (!streamActive && !streamText && phaseCards.length === 0) return null;

  const visible = phaseCards.filter((c) => c.phase !== "agent_start" && c.phase !== "agent_done");

  return (
    <div className="animate-pageIn">
      <div className="flex items-center gap-2 mb-1">
        {streamAgent && <span className="text-sm leading-none">{getAvatar(streamAgent)}</span>}
        <span className="text-xs font-bold uppercase tracking-wider" style={{ color: streamAgent ? "#a78bfa" : "var(--app-text-secondary)" }}>
          {streamAgent || "Yumi"}
        </span>
      </div>
      {(streamActive || visible.length > 0) && hasCards && visible.map((card) => {
        const step = dshFromCard(card);
        const thinkLong = card.phase === "thinking" && (card.content || "").length > 88;
        const expanded = !!openThink[card.key];
        return (
          <div key={card.key} className="animate-pageIn py-0.5">
            <div className="flex items-baseline gap-2 min-w-0">
              <span className="w-3.5 h-3.5 flex-shrink-0 text-[var(--app-text-secondary)] translate-y-0.5">
                <DshIcon kind={step.kind} />
              </span>
              <span className="text-[13px] font-semibold text-[var(--app-text)] flex-shrink-0">{step.tag}</span>
              <span className="text-[var(--app-text-tertiary)] flex-shrink-0">·</span>
              <span className={step.isPath
                ? "text-[13px] text-[#2563eb] underline underline-offset-2 decoration-[#93c5fd] min-w-0 truncate"
                : "text-[13px] text-[var(--app-text-secondary)] min-w-0 truncate"}>
                {step.detail}
              </span>
            </div>
            {step.extra ? <div className="ml-9 text-[11px] text-red-500">{step.extra}</div> : null}
            {thinkLong ? (
              <div className="ml-9">
                <button
                  type="button"
                  className="text-[11px] text-[var(--app-text-tertiary)] hover:text-[var(--app-text-secondary)]"
                  onClick={() => setOpenThink((p) => ({ ...p, [card.key]: !p[card.key] }))}
                >
                  {expanded ? "收起思考" : "展开思考"}
                </button>
                {expanded ? (
                  <div className="mt-1 text-xs leading-relaxed whitespace-pre-wrap text-[var(--app-text-secondary)]">
                    {card.content}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        );
      })}
      <div className="text-sm leading-relaxed text-[var(--app-text)] mt-1 pl-1">
        {streamText ? <MarkdownContent content={streamText} /> : (streamActive ? <span className="text-[var(--app-text-tertiary)]">...</span> : "")}
      </div>
    </div>
  );
}
