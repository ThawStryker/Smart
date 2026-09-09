import { db } from "edgespark";
import { eq, and } from "drizzle-orm";
import { agentFiles } from "@defs";
import type { PromptContext } from "../types";

interface Frontmatter {
  name?: string;
  description?: string;
}

function parseFrontmatter(content: string): { meta: Frontmatter; body: string } {
  const trimmed = content.trimStart();
  if (!trimmed.startsWith("---")) return { meta: {}, body: content };

  const endIdx = trimmed.indexOf("---", 3);
  if (endIdx === -1) return { meta: {}, body: content };

  const yamlBlock = trimmed.slice(3, endIdx).trim();
  const body = trimmed.slice(endIdx + 3).trim();
  const meta: Frontmatter = {};
  for (const line of yamlBlock.split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    let value = line.slice(colonIdx + 1).trim();
    value = value.replace(/^["']|["']$/g, "");
    if (key === "name" || key === "description") meta[key] = value;
  }
  return { meta, body };
}

function extractSummary(content: string): string {
  const firstLine = content.trim().split("\n")[0]?.replace(/^#+\s*/, "") || "";
  return firstLine.slice(0, 80) || "(empty)";
}

export async function loadPromptContext(userId: string, agentName: string): Promise<PromptContext> {
  const files = await db.select()
    .from(agentFiles)
    .where(and(eq(agentFiles.userId, userId), eq(agentFiles.agentName, agentName)));

  const map = new Map<string, string>();
  for (const f of files) map.set(f.path, f.content || "");

  const context: string[] = [];
  const skillCatalog: PromptContext["skillCatalog"] = [];
  const memoryIndex: PromptContext["memoryIndex"] = [];

  for (const [path, content] of map) {
    if (path.startsWith("context/") && path.endsWith(".md")) {
      context.push(content);
    }
    const skillMatch = path.match(/^skills\/([^/]+)\/SKILL\.md$/);
    if (skillMatch) {
      const { meta, body } = parseFrontmatter(content);
      skillCatalog.push({
        name: meta.name || skillMatch[1],
        description: meta.description || extractSummary(body),
      });
    }
    if (path.startsWith("memory/") && path.endsWith(".md") &&
        !["memory/MEMORY.md", "memory/USER.md"].includes(path)) {
      const { meta, body } = parseFrontmatter(content);
      memoryIndex.push({ path, summary: meta.description || extractSummary(body) });
    }
  }

  return {
    agentsMd: map.get("AGENTS.md") || "",
    context,
    skillCatalog,
    memoryIndex,
    userMd: map.get("memory/USER.md") || "",
    memoryMd: map.get("memory/MEMORY.md") || "",
  };
}
