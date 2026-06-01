// ── Phase 枚举 ──
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

// ── 工具 → Phase 映射 ──
export const DEFAULT_TOOL_PHASE: Record<string, PhaseName> = {
  read_file: "read",
  list_files: "read",
  write_file: "write",
  edit_file: "write",
  web_search: "search",
  call_agent: "agent_start",
  memory_save: "memory",
  memory_recall: "memory",
  skill_list: "skill",
  skill_view: "skill",
};

// ── Phase 事件类型 ──
export type PhaseEvent =
  | { type: "phase"; phase: PhaseName; meta?: Record<string, unknown> }
  | { type: "delta"; phase: PhaseName; text: string }
  | { type: "done" }
  | { type: "error"; message: string };

// ── 工具处理器（由 chat.ts 组装注入） ──
export interface ToolHandler {
  execute: (args: Record<string, unknown>) => Promise<string>;
  phase: PhaseName;
  meta?: (args: Record<string, unknown>) => Record<string, unknown>;
}

// ── Engine 输入 ──
export interface EngineInput {
  sessionId: number;
  userId: string;
  userMessage: string;
  targetAgent: string | null;
  suppressSave?: boolean;
  depth?: number;
  modelConfig: {
    baseURL: string;
    apiPath: string;
    apiKey: string;
    modelName: string;
  };
  toolHandlers: Record<string, ToolHandler>;
  toolDefs: Array<Record<string, unknown>>;
}

// ── Engine 输出类型 ──
export type EngineOutput = AsyncGenerator<PhaseEvent, void, undefined>;
