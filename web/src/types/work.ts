export interface WorkAgent {
  name: string;
  avatar: string;
  sourceListingId?: number | null;
}

export interface WorkSession {
  id: number;
  title: string;
  summary: string;
}

export interface FileEntry {
  id: number;
  path: string;
  content: string;
  isFolder: number;
}

export interface ChatMessage {
  id: number;
  agentName: string | null;
  role: string;
  content: string;
  createdAt: string;
  timeline?: Array<{ phase: string; meta?: Record<string, unknown>; content: string }>;
}

export interface StreamingState {
  agentName: string | null;
  content: string;
  isActive: boolean;
}

export type SSEEvent =
  | { type: "text"; agentName?: string | null; delta: string }
  | { type: "thinking"; delta: string }
  | { type: "agent_start"; agentName: string }
  | { type: "agent_done"; agentName: string }
  | { type: "tool_exec"; toolName: string; agentName?: string; args?: Record<string, unknown> }
  | { type: "doc"; path: string; delta: string }
  | { type: "error"; message: string }
  | { type: "done" };
