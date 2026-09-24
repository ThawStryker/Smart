import type { PhaseEvent, PhaseName } from "./phases";

export interface TimelineStep {
  phase: PhaseName;
  meta?: Record<string, unknown>;
  content: string;
}

/** 把 SSE 事件收成和前端 DSH 卡片一致的时间线 */
export function applyTimelineEvent(cards: TimelineStep[], ev: PhaseEvent) {
  if (ev.type === "phase") {
    const p = ev.phase;
    if (p === "text" || p === "agent_start" || p === "agent_done") return;
    const last = cards[cards.length - 1];
    if (last && last.phase === p) {
      const a = last.meta || {};
      const b = ev.meta || {};
      if (a.path === b.path && a.name === b.name && a.tool === b.tool && a.mode === b.mode) return;
    }
    cards.push({ phase: p, meta: ev.meta, content: "" });
    return;
  }
  if (ev.type !== "delta") return;
  const p = ev.phase;
  const chunk = ev.text || "";
  if (p === "text" || p === "write" || !p) return;
  if (p === "thinking") {
    const last = cards[cards.length - 1];
    if (last?.phase === "thinking") {
      last.content += chunk;
      return;
    }
    cards.push({ phase: "thinking", content: chunk });
    return;
  }
  for (let i = cards.length - 1; i >= 0; i--) {
    if (cards[i].phase === p) {
      cards[i].content += chunk;
      break;
    }
  }
}
