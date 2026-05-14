import { db } from "edgespark";
import { eq, inArray } from "drizzle-orm";
import { mcps } from "@defs";
import type { ToolDef } from "./builtin";

export async function loadMcpTools(
  selectedMcps: string[],
): Promise<{ tools: ToolDef[]; mcpMap: Map<string, Record<string, unknown>> }> {
  const tools: ToolDef[] = [];
  const mcpMap = new Map<string, Record<string, unknown>>();

  // Always inject smart-deploy
  const [smartDeployMcp] = await db.select().from(mcps).where(eq(mcps.name, "smart-deploy"));
  if (smartDeployMcp && smartDeployMcp.enabled && smartDeployMcp.config) {
    try {
      const cfg = JSON.parse(smartDeployMcp.config);
      tools.push({
        type: "function",
        function: {
          name: "smart_deploy",
          description: cfg.description || smartDeployMcp.description || "Deploy the current project",
          parameters: cfg.parameters || { type: "object", properties: {} },
        },
      });
    } catch {}
  }

  // User-selected MCPs
  if (selectedMcps.length > 0) {
    const mcpRows = await db.select().from(mcps).where(inArray(mcps.name, selectedMcps));
    for (const m of mcpRows) {
      if (m.enabled && m.config) {
        try {
          const cfg = JSON.parse(m.config);
          const name = m.name.replace(/-/g, "_");
          const tool: ToolDef = {
            type: "function",
            function: {
              name,
              description: cfg.description || m.description || m.name,
              parameters: cfg.parameters || { type: "object", properties: {}, required: [] },
            },
          };
          tools.push(tool);
          mcpMap.set(name, cfg);
        } catch {}
      }
    }
  }

  return { tools, mcpMap };
}

export async function buildMcpPrompt(selectedMcps: string[]): Promise<string> {
  if (selectedMcps.length === 0) return "";
  const mcpRows = await db.select().from(mcps).where(inArray(mcps.name, selectedMcps));
  if (mcpRows.length === 0) return "";
  const desc = mcpRows.map(m => `- **${m.name}**: ${m.description || ""} (config: ${m.config || "{}"})`).join("\n");
  return `\n\n## 可用 MCP 工具\n\n${desc}\n\n调用 MCP 时使用工具调用机制。`;
}
