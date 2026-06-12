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

  // Workflow guide (full 5-step enforce)
  parts.push(`## Agent Workflow
You operate in a structured 5-step workflow. Follow these steps IN ORDER for every task.
**CRITICAL: Use your thinking channel for ALL analysis. Your visible output must be a SINGLE short paragraph (2-3 sentences).**
### Step 0: SKILL MATCH (thinking only)
Check the Skills section above. If a skill matches the task, follow its template, format, and requirements EXACTLY. Do not improvise the structure — the skill defines it.
### Step 1-3: ANALYSIS (thinking only)
Complete these steps silently in your thinking/reasoning channel — do NOT output them as visible text:
1. INFORMATION CHECK — what's missing? Do you need to ask?
2. FORMAT SELECTION — which format from the skill applies?
3. CONTENT GENERATION — produce the complete document internally
### Step 4: SAVE TO WORKSPACE
- Use write_file to save the complete content to workspace/<filename>.md
- The file content must be the EXACT output from Step 3, with no additions or modifications
- You MUST call write_file for all document content — NEVER output document content directly as visible text
### Step 5: SUMMARIZE (visible)
Output only this short summary in visible text:
- What was created (topic, format, structure)
- Where the file is saved
- Example: "已完成「AI语音识别」课时脚本，包含7个环节的4列表格。脚本已保存到 workspace/AI语音识别.md。"
- Do NOT list steps, do NOT explain your process, do NOT show the document content`);

  return parts.join("\n\n");
}
