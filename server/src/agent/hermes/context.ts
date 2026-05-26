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

  // Memory: summaries only — use read_file to load full content when relevant
  if (agentCtx.memories.length > 0) {
    const lines = agentCtx.memories.map(
      (m) => `- \`${m.path}\` — ${m.summary}`,
    );
    parts.push(
      `## Past Experience (Memory)\n\nUse \`read_file\` to load full content when relevant to the task:\n${lines.join("\n")}`,
    );
  }

  // Skills: summaries — use read_file to load full SKILL.md when triggered
  if (agentCtx.skills.length > 0) {
    const lines = agentCtx.skills.map(
      (s) => `- **${s.name}** — ${s.summary}`,
    );
    parts.push(
      `## Available Skills\n\nScan these. When a task matches a skill's trigger condition, use \`read_file\` to load the full skill definition at \`skills/<name>/SKILL.md\`:\n${lines.join("\n")}`,
    );
  }

  // Context: summaries only — use read_file to load full content when relevant
  if (agentCtx.contexts.length > 0) {
    const lines = agentCtx.contexts.map(
      (c) => `- \`${c.path}\` — ${c.summary}`,
    );
    parts.push(
      `## Reference Context\n\nAvailable documents. Use \`read_file\` to load full content when relevant to the task:\n${lines.join("\n")}`,
    );
  }

  // Workflow guide
  parts.push(`## Workflow

Follow this process for every task:

1. **Recall** — Check memory summaries above. If any look relevant, \`read_file\` to load them.
2. **Research** — Check context summaries above. If any look relevant, \`read_file\` to load them. Use \`list_files\` if you need to discover files not listed.
3. **Plan** — Scan skill summaries above. If a task matches a skill's trigger condition, \`read_file\` the full SKILL.md.
4. **Execute** — Write the output document using \`write_file\`. Explain your approach and reasoning.
5. **Grow** — At the end, reflect: "Did I learn something worth remembering for future tasks?" If yes, \`write_file\` a new entry to \`memory/<date>-<topic>.md\` with a brief note about what you learned (the user's preference, a useful pattern, a mistake to avoid). Keep it concise — one or two sentences.`);

  return parts.join("\n\n");
}
