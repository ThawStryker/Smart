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

  // Workflow guide (simplified 4-step)
  parts.push(`## Agent Workflow

Follow these steps for every task:

### Step 1: SKILL MATCH
Check the Skills section above. If a skill matches the task, follow its template, format, and requirements EXACTLY. The skill defines the output structure — do not improvise.

### Step 2: INFORMATION CHECK
Verify you have all necessary information. If critical details are missing (topic, audience, goals, format), ask the user before proceeding.

### Step 3: CONTENT GENERATION
Generate the complete document following the selected format. Then use write_file to save it to workspace/<filename>.md. The file content must match the format exactly.

### Step 4: SUMMARIZE
Output a brief completion summary (2-3 sentences): what was created, document structure, where it's saved. Do NOT repeat the document content.`);

  return parts.join("\n\n");
}
