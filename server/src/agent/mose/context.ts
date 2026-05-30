import type { AgentFileContext } from "./types";

export function buildConversationSummary(
  messages: Array<{ agentName: string | null; content: string }>,
): string {
  if (messages.length === 0) return "";
  return messages
    .map((m) => `[${m.agentName || "user"}]: ${(m.content || "").slice(0, 200)}`)
    .join("\n");
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

  // Skills — full content pre-loaded (same as context)
  if (agentCtx.skills.length > 0) {
    const skillBlocks = agentCtx.skills.map(
      (s) => `### ${s.name}\n\n${s.entry}`,
    );
    parts.push(`## Skills (pre-loaded)\n\nThe following skills are already loaded. You MUST follow the matching skill's exact template, structure, and requirements when the task fits.\n\n${skillBlocks.join("\n\n---\n\n")}`);
  }

  // Workflow guide
  parts.push(`## Workflow

1. **Match** — Check the Skills section above. If a skill matches the task, follow its template, format, and requirements EXACTLY. Do not improvise the structure — the skill defines it.
2. **Execute** — Write output with \`write_file\`. All output files MUST be placed under \`workspace/\` (e.g., \`workspace/report.md\`).
3. **Grow** — After the task: did you learn something? If yes, append a brief note to \`memory/MEMORY.md\`. Keep each entry to 1-2 sentences. Do NOT overwrite — append.`);

  return parts.join("\n\n");
}
