export type { PhaseEvent, PhaseName } from "../engine/events";
import type { PhaseName } from "../engine/events";

export const DEFAULT_TOOL_PHASE: Record<string, PhaseName> = {
  read_file: "read",
  list_files: "read",
  write_file: "write",
  edit_file: "write",
  skill_load: "skill",
  memory_recall: "memory",
  ask_user: "text",
};

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
  onSaveMessage?: (msg: { sessionId: number; agentName: string | null; role: string; content: string }) => Promise<void>;
  focusFile?: string | null;
}
