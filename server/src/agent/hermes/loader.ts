import { db } from "edgespark";
import { eq, and, like } from "drizzle-orm";
import { workFiles, workMessages } from "@defs";
import type { AgentFileContext } from "./types";

function extractSummary(content: string): string {
  const firstLine = content.trim().split("\n")[0]?.replace(/^#+\s*/, "") || "";
  return firstLine.slice(0, 80) || "(empty)";
}

export async function loadAgentFiles(
  sessionId: number,
  agentName: string,
): Promise<AgentFileContext> {
  const prefix = `agents/${agentName}/`;
  const allFiles = await db
    .select()
    .from(workFiles)
    .where(
      and(
        eq(workFiles.sessionId, sessionId),
        like(workFiles.path, `${prefix}%`),
      ),
    );

  const fileMap = new Map<string, string>();
  for (const f of allFiles) {
    fileMap.set(f.path, f.content || "");
  }

  const agentsMd = fileMap.get(`${prefix}AGENTS.md`) || "";
  const userMd = fileMap.get(`${prefix}memory/USER.md`) || "";
  const memoryMd = fileMap.get(`${prefix}memory/MEMORY.md`) || "";

  // Skills: summaries + full SKILL.md entry
  const skills: Array<{ name: string; summary: string; entry: string }> = [];
  for (const [path, content] of fileMap.entries()) {
    const match = path.match(new RegExp(`^${prefix}skills/([^/]+)/SKILL\\.md$`));
    if (match) {
      skills.push({ name: match[1], summary: extractSummary(content), entry: content });
    }
  }

  // Context: full content, always loaded
  const contexts: string[] = [];
  for (const [path, content] of fileMap.entries()) {
    if (path.startsWith(`${prefix}context/`) && path.endsWith(".md")) {
      contexts.push(content);
    }
  }

  return { agentsMd, userMd, memoryMd, skills, contexts };
}

export async function loadSessionMessages(
  sessionId: number,
): Promise<Array<{ agentName: string | null; content: string }>> {
  const messages = await db
    .select()
    .from(workMessages)
    .where(eq(workMessages.sessionId, sessionId));
  return messages.map((m) => ({
    agentName: m.agentName,
    content: m.content || "",
  }));
}
