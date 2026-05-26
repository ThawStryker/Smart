import type { AgentFileContext } from "./types";

export function buildConversationSummary(
  messages: Array<{ agentName: string | null; content: string }>,
): string {
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
