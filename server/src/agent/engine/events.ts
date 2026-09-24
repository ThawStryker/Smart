export type PhaseName =
  | "thinking"
  | "agent_start"
  | "agent_done"
  | "read"
  | "memory"
  | "skill"
  | "search"
  | "write"
  | "text";

export type PhaseEvent =
  | { type: "phase"; phase: PhaseName; meta?: Record<string, unknown> }
  | { type: "delta"; phase: PhaseName; text: string; meta?: Record<string, unknown> }
  | { type: "done" }
  | { type: "error"; message: string };
