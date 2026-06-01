import { db } from "edgespark";
import { eq, and } from "drizzle-orm";
import { agentFiles, userAgents } from "@defs";
import { register } from "./registry";
import type { ToolContext } from "./registry";

function extractSummary(content: string): string {
  const firstLine = content.trim().split("\n")[0]?.replace(/^#+\s*/, "") || "";
  return firstLine.slice(0, 80) || "(empty)";
}

async function skillList(_args: Record<string, unknown>, ctx: ToolContext): Promise<string> {
  if (!ctx.agentName) return "No agent context";

  const files = await db.select({ path: agentFiles.path, content: agentFiles.content })
    .from(agentFiles)
    .where(and(eq(agentFiles.userId, ctx.userId), eq(agentFiles.agentName, ctx.agentName)));

  const skills: Array<{ name: string; summary: string }> = [];
  for (const f of files) {
    const match = f.path?.match(/^skills\/([^/]+)\/SKILL\.md$/);
    if (match) {
      skills.push({ name: match[1], summary: extractSummary(f.content || "") });
    }
  }

  if (skills.length === 0) return "No skills available for this agent.";
  return skills.map(s => `- **${s.name}**: ${s.summary}`).join("\n");
}

async function skillView(args: Record<string, unknown>, ctx: ToolContext): Promise<string> {
  const name = args.name as string | undefined;
  if (!name) return "Error: skill name required";
  if (!ctx.agentName) return "Error: no agent context";

  const path = `skills/${name}/SKILL.md`;
  const rows = await db.select({ content: agentFiles.content })
    .from(agentFiles)
    .where(and(eq(agentFiles.userId, ctx.userId), eq(agentFiles.agentName, ctx.agentName), eq(agentFiles.path, path)));

  if (!rows[0]?.content) return `Skill "${name}" not found or empty.`;
  return `## Skill: ${name}\n\n${rows[0].content}`;
}

register({
  name: "skill_list",
  description: "List all available skills for the current agent. Returns name + summary for each.",
  parameters: { type: "object", properties: {}, required: [] },
  phase: "skill",
  handler: skillList,
});

register({
  name: "skill_view",
  description: "Load the full instructions for a specific skill. Call this when a task matches an available skill — do NOT rely on the summary alone.",
  parameters: {
    type: "object",
    properties: { name: { type: "string", description: "Skill name (from skill_list)" } },
    required: ["name"],
  },
  phase: "skill",
  meta: (args) => ({ name: args.name as string }),
  handler: skillView,
});
