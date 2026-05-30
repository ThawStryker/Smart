import { writeFile, readFile, listFiles } from "./file-ops";
import { webSearch } from "./web-search";
import { callAgent } from "./call-agent";
import { useSkill } from "./use-skill";
import type { MoseLoopParams } from "../types";

export async function executeAgentTool(
  name: string,
  args: Record<string, unknown>,
  sessionId: number,
  params: MoseLoopParams,
  eventQueue: Array<Record<string, unknown>>,
  moseLoop: (params: MoseLoopParams) => Promise<string>,
): Promise<string> {
  switch (name) {
    case "write_file": return writeFile(args, sessionId, eventQueue, params.userId, params.targetAgent);
    case "read_file": return readFile(args, sessionId, params.userId, params.targetAgent);
    case "list_files": return listFiles(args, sessionId, params.userId, params.targetAgent);
    case "web_search": return webSearch(args);
    case "call_agent": return callAgent(args, params, eventQueue, moseLoop);
    case "use_skill": return useSkill(args, params.userId, params.targetAgent);
    default: return `Unknown tool: ${name}`;
  }
}

export const AGENT_TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "call_agent",
      description: "Delegate a subtask to another agent",
      parameters: {
        type: "object" as const,
        properties: {
          name: { type: "string" as const, description: "Agent name" },
          task: { type: "string" as const, description: "Task description" },
        },
        required: ["name", "task"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "write_file",
      description: "Write content to a workspace file",
      parameters: {
        type: "object" as const,
        properties: {
          path: { type: "string" as const, description: "File path" },
          content: { type: "string" as const, description: "File content (markdown)" },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "read_file",
      description: "Read a workspace file",
      parameters: {
        type: "object" as const,
        properties: {
          path: { type: "string" as const, description: "File path" },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "list_files",
      description: "List workspace files",
      parameters: {
        type: "object" as const,
        properties: {
          prefix: { type: "string" as const, description: "Path prefix filter" },
        },
        required: [],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "use_skill",
      description: "Load and apply a skill's full instructions. Call this when a task matches an available skill.",
      parameters: {
        type: "object" as const,
        properties: {
          name: { type: "string" as const, description: "Skill name (from Available Skills list)" },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "web_search",
      description: "Search the web",
      parameters: {
        type: "object" as const,
        properties: {
          query: { type: "string" as const, description: "Search query" },
        },
        required: ["query"],
      },
    },
  },
];
