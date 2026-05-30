import { db } from "edgespark";
import { eq, and } from "drizzle-orm";
import { agentFiles } from "@defs";

export async function useSkill(
  args: Record<string, unknown>,
  userId: string,
  agentName?: string | null,
): Promise<string> {
  const skillName = args.name as string | undefined;
  if (!skillName) return "Error: name required";
  if (!agentName) return "Error: agent context required";

  const path = `skills/${skillName}/SKILL.md`;
  const rows = await db
    .select()
    .from(agentFiles)
    .where(and(eq(agentFiles.userId, userId), eq(agentFiles.agentName, agentName), eq(agentFiles.path, path)));

  const file = rows[0];
  if (!file || !file.content) return `Skill not found or empty: ${skillName}`;

  return `## Skill: ${skillName}\n\n${file.content}`;
}
