import { db, storage } from "edgespark";
import { eq, inArray } from "drizzle-orm";
import { skills as skillsDef, buckets } from "@defs";

async function readSkillMd(storagePath: string): Promise<string | null> {
  const md = await storage.from(buckets.sourceBuckets).get(storagePath + "SKILL.md");
  if (md) return new TextDecoder().decode(md.body);

  const list = await storage.from(buckets.sourceBuckets).list({ prefix: storagePath, limit: 50 });
  const mdPath = list.files.find(f => f.path.endsWith("/SKILL.md") || f.path.endsWith("SKILL.md"));
  if (mdPath) {
    const obj = await storage.from(buckets.sourceBuckets).get(mdPath.path);
    if (obj) return new TextDecoder().decode(obj.body);
  }
  return null;
}

export async function buildSkillPrompt(selectedSkills: string[]): Promise<string> {
  let result = "";

  // Always inject superpowers
  const skillsToLoad = new Set(selectedSkills);
  skillsToLoad.add("superpowers");

  const rows = await db.select().from(skillsDef).where(inArray(skillsDef.name, [...skillsToLoad]));
  for (const skill of rows) {
    if (skill.status !== "installed" || !skill.storagePath) continue;
    const content = await readSkillMd(skill.storagePath);
    if (content) {
      result += `\n\n## Skill: ${skill.name}\n\n${content.slice(0, 3000)}`;
    }
  }
  return result;
}

// Parse slash commands from SKILL.md "### Commands" section
export async function getSkillCommands(): Promise<
  Array<{ skillName: string; skillId: number; commands: Array<{ name: string; description: string }> }>
> {
  const rows = await db.select().from(skillsDef).where(eq(skillsDef.status, "installed"));
  const result: Array<{ skillName: string; skillId: number; commands: Array<{ name: string; description: string }> }> = [];

  for (const skill of rows) {
    if (!skill.storagePath) continue;
    const content = await readSkillMd(skill.storagePath);
    if (!content) continue;

    const m = content.match(/###\s+Commands\s*\n([\s\S]*?)(?=\n###|\n##|$)/i);
    if (!m) continue;

    const commands: Array<{ name: string; description: string }> = [];
    for (const line of m[1].split("\n")) {
      const cmdMatch = line.match(/-\s+`(\/[a-z_-]+)`\s*[—–-]?\s*(.*)/i);
      if (cmdMatch) commands.push({ name: cmdMatch[1], description: cmdMatch[2].trim() });
    }
    if (commands.length > 0) result.push({ skillName: skill.name, skillId: skill.id, commands });
  }
  return result;
}
