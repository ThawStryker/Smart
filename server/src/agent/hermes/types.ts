export interface HermesLoopParams {
  sessionId: number;
  userId: string;
  userMessage: string;
  targetAgent: string | null;
  suppressAgentCard?: boolean;
  modelConfig: {
    baseURL: string;
    apiPath: string;
    apiKey: string;
    modelName: string;
  };
  eventQueue: Array<Record<string, unknown>>;
}

export interface FileSummary {
  path: string;
  summary: string;
}

export interface AgentFileContext {
  agentsMd: string;
  userMd: string;
  memoryMd: string;
  skills: Array<{ name: string; summary: string; entry: string }>;
  contexts: string[];
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
