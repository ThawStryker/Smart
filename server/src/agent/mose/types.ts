export interface AgentFileContext {
  agentsMd: string;
  userMd: string;
  memoryMd: string;
  skills: Array<{ name: string; summary: string; entry: string }>;
  contexts: string[];
}
