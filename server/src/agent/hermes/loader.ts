import { db } from "edgespark";
import { eq, and, like } from "drizzle-orm";
import { workFiles, workMessages } from "@defs";
import type { AgentFileContext, FileSummary } from "./types";

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

  // Memory: summaries only (path + first line)
  const memories: FileSummary[] = [];
  for (const [path, content] of fileMap.entries()) {
    if (path.startsWith(`${prefix}memory/`) && path.endsWith(".md")) {
      memories.push({ path: path.replace(`${prefix}`, ""), summary: extractSummary(content) });
    }
  }

  // Skills: summary + full entry for SKILL.md
  const skills: Array<{ name: string; summary: string; entry: string }> = [];
  for (const [path, content] of fileMap.entries()) {
    const match = path.match(new RegExp(`^${prefix}skills/([^/]+)/SKILL\\.md$`));
    if (match) {
      skills.push({ name: match[1], summary: extractSummary(content), entry: content });
    }
  }

  // Context: summaries only (path + first line)
  const contexts: FileSummary[] = [];
  for (const [path, content] of fileMap.entries()) {
    if (path.startsWith(`${prefix}context/`) && path.endsWith(".md")) {
      contexts.push({ path: path.replace(`${prefix}`, ""), summary: extractSummary(content) });
    }
  }

  return { agentsMd, memories, skills, contexts };
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
