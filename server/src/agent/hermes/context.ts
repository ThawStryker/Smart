import { db } from "edgespark";
import { eq, and, like } from "drizzle-orm";
import { workFiles, workMessages } from "@defs";

export interface AgentFileContext {
  agentsMd: string;
  memories: string[];
  skills: Array<{ name: string; entry: string }>;
  contexts: string[];
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

  const memories: string[] = [];
  for (const [path, content] of fileMap.entries()) {
    if (path.startsWith(`${prefix}memory/`) && path.endsWith(".md")) {
      memories.push(content);
    }
  }

  const skills: Array<{ name: string; entry: string }> = [];
  for (const [path, content] of fileMap.entries()) {
    const match = path.match(new RegExp(`^${prefix}skills/([^/]+)/SKILL\\.md$`));
    if (match) {
      skills.push({ name: match[1], entry: content });
    }
  }

  const contexts: string[] = [];
  for (const [path, content] of fileMap.entries()) {
    if (path.startsWith(`${prefix}context/`) && path.endsWith(".md")) {
      contexts.push(content);
    }
  }

  return { agentsMd, memories, skills, contexts };
}

export async function buildConversationSummary(sessionId: number): Promise<string> {
  const messages = await db
    .select()
    .from(workMessages)
    .where(eq(workMessages.sessionId, sessionId));

  if (messages.length === 0) return "";

  return messages
    .map((m) => `[${m.agentName || "user"}]: ${(m.content || "").slice(0, 200)}`)
    .join("\n");
}

export function listAgentNames(files: Array<{ path: string }>): string[] {
  const names = new Set<string>();
  for (const f of files) {
    const match = f.path.match(/^agents\/([^/]+)\//);
    if (match) names.add(match[1]);
  }
  return Array.from(names);
}

export function buildAgentSystemPrompt(agentCtx: AgentFileContext): string {
  const parts: string[] = [];

  if (agentCtx.agentsMd) {
    parts.push(`## Role Definition\n\n${agentCtx.agentsMd}`);
  }

  if (agentCtx.memories.length > 0) {
    parts.push(`## Memory\n\n${agentCtx.memories.join("\n\n---\n\n")}`);
  }

  if (agentCtx.skills.length > 0) {
    parts.push(
      `## Available Skills\n\n${agentCtx.skills
        .map((s) => `### ${s.name}\n\n${s.entry}`)
        .join("\n\n")}`,
    );
  }

  if (agentCtx.contexts.length > 0) {
    parts.push(`## Reference Context\n\n${agentCtx.contexts.join("\n\n---\n\n")}`);
  }

  return parts.join("\n\n");
}
