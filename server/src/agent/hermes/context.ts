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

  // AGENTS.md — role definition + constraints
  if (agentCtx.agentsMd) {
    parts.push(`## Role & Rules\n\n${agentCtx.agentsMd}`);
  }

  // Context — full load, always-present background knowledge
  if (agentCtx.contexts.length > 0) {
    parts.push(`## Background Context\n\n${agentCtx.contexts.join("\n\n---\n\n")}`);
  }

  // USER.md — user's fixed memory with document references for on-demand loading
  if (agentCtx.userMd) {
    parts.push(
      `## User Memory\n\n${agentCtx.userMd}\n\n(These are the user's permanent preferences. Use \`read_file\` to load referenced documents on demand.)`,
    );
  }

  // MEMORY.md — agent's self-learned growth memory
  if (agentCtx.memoryMd) {
    parts.push(
      `## Agent Memory\n\n${agentCtx.memoryMd}\n\n(Your accumulated learnings from past tasks. Learn from them.)`,
    );
  }

  // Skills — summaries, on-demand full loading
  if (agentCtx.skills.length > 0) {
    const lines = agentCtx.skills.map(
      (s) => `- **${s.name}** — ${s.summary}`,
    );
    parts.push(
      `## Available Skills\n\nScan summaries. When a task matches a skill, use \`read_file\` to load \`skills/<name>/SKILL.md\`:\n${lines.join("\n")}`,
    );
  }

  // Workflow guide
  parts.push(`## Workflow

1. **Read** — Review Background Context and User Memory above (already loaded). Load referenced documents with \`read_file\` if needed.
2. **Plan** — Scan skill summaries. Load full SKILL.md for matching ones.
3. **Execute** — Write output with \`write_file\`. All output files MUST be placed under \`workspace/\` (e.g., \`workspace/report.md\`). Explain your approach and reasoning.
4. **Grow** — After the task: did you learn something? If yes, append a brief note to \`memory/MEMORY.md\`. Keep each entry to 1-2 sentences. Do NOT overwrite — append.`);

  return parts.join("\n\n");
}
