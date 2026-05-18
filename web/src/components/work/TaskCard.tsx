import { useState } from "react";

export interface TaskCardData {
  id: string;
  name: string;
  task: string;
  status: "running" | "done";
  output: string;
  files: string[];
}

export function TaskCard({ card, onOpenFile }: {
  card: TaskCardData;
  onOpenFile?: (path: string) => void;
}) {
  const [expanded, setExpanded] = useState(card.status === "running");

  return (
    <div className="rounded-xl border mx-4 my-3 overflow-hidden shadow-sm"
      style={{ background: "#fffdf7", borderColor: card.status === "running" ? "#e0c888" : "#d4e0c8" }}>
      {/* Header */}
      <button onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-left transition-colors hover:bg-white/40">
        <div className={`w-7 h-7 rounded-lg bg-gradient-to-br flex items-center justify-center text-white text-[10px] font-bold shrink-0 shadow-sm`}
          style={{ background: "linear-gradient(135deg, #c7853a, #a0622e)" }}>
          {card.name.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[12px] font-medium" style={{ color: "#4a3728" }}>
            {card.name}
            {card.status === "running" && (
              <span className="inline-flex gap-0.5 ml-2">
                <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: "#c7853a" }} />
                <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: "#c7853a", animationDelay: "150ms" }} />
                <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: "#c7853a", animationDelay: "300ms" }} />
              </span>
            )}
          </div>
          <div className="text-[11px] opacity-50 truncate">{card.task}</div>
        </div>
        <svg className={`w-4 h-4 transition-transform ${expanded ? "rotate-180" : ""}`}
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
          style={{ color: "#b8a088" }}>
          <polyline points="6,9 12,15 18,9" />
        </svg>
      </button>

      {/* Body */}
      {expanded && (
        <div className="px-4 pb-3 space-y-2">
          {card.output && (
            <div className="text-[12px] leading-relaxed border rounded-lg p-3"
              style={{ background: "#fbf9f2", color: "#5c4330", borderColor: "#e8e3d7", whiteSpace: "pre-wrap" }}>
              {card.output}
            </div>
          )}
          {card.files.length > 0 && (
            <div className="text-[11px] space-y-0.5">
              <div className="font-medium opacity-40">产出文件</div>
              {card.files.map(f => (
                <button key={f} onClick={() => onOpenFile?.(f)}
                  className="block text-left w-full px-2 py-1 rounded hover:bg-amber-50/80 transition-colors"
                  style={{ color: "#c7853a" }}>
                  📄 {f.split("/").pop() || f}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
