export interface HermesLoopParams {
  sessionId: number;
  userId: string;
  userMessage: string;
  targetAgent: string | null;
  modelConfig: {
    baseURL: string;
    apiPath: string;
    apiKey: string;
    modelName: string;
  };
  eventQueue: Array<Record<string, unknown>>;
  allFiles: Array<{ path: string; content: string }>;
}

export interface AgentFileContext {
  agentsMd: string;
  memories: string[];
  skills: Array<{ name: string; entry: string }>;
  contexts: string[];
}

export type SSEEvent =
  | { type: "text"; agentName?: string | null; delta: string }
  | { type: "agent_start"; agentName: string }
  | { type: "agent_done"; agentName: string }
  | { type: "tool_exec"; toolName: string; agentName?: string }
  | { type: "doc"; path: string; delta: string }
  | { type: "error"; message: string }
  | { type: "done" };
