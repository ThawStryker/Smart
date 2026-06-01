import type { PhaseName } from "../phases";

export interface ToolContext {
  sessionId: number;
  userId: string;
  agentName: string | null;
}

export interface ToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  phase: PhaseName;
  meta?: (args: Record<string, unknown>) => Record<string, unknown>;
  handler: (args: Record<string, unknown>, ctx: ToolContext) => Promise<string>;
}

const _tools = new Map<string, ToolDef>();

export function register(tool: ToolDef): void {
  _tools.set(tool.name, tool);
}

export function get(name: string): ToolDef | undefined {
  return _tools.get(name);
}

export function getAll(): ToolDef[] {
  return Array.from(_tools.values());
}

export function getOpenAITools(): Array<Record<string, unknown>> {
  return Array.from(_tools.values()).map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}

export async function execute(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<string> {
  const tool = _tools.get(name);
  if (!tool) return `Unknown tool: ${name}`;
  try {
    return await tool.handler(args, ctx);
  } catch (err: any) {
    return `Error: ${err.message}`;
  }
}
