import { BUILTIN_TOOLS, filterToolsForPhase, type ToolDef } from "./builtin";
import { loadMcpTools } from "./mcp";

export async function buildToolList(
  phase: string,
  selectedMcps: string[],
): Promise<{ tools: ToolDef[]; mcpMap: Map<string, Record<string, unknown>> }> {
  const { tools: mcpTools, mcpMap } = await loadMcpTools(selectedMcps);
  const allTools = [...BUILTIN_TOOLS, ...mcpTools];
  const tools = filterToolsForPhase(allTools, phase);
  return { tools, mcpMap };
}
