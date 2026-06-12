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

  // ── 角色定义（AGENTS.md） ──
  if (agentCtx.identity) {
    parts.push(agentCtx.identity);
  }

  // ── 行为准则（context/ 目录） ──
  if (agentCtx.contexts.length > 0) {
    parts.push(`## Working Style\n\n${agentCtx.contexts.join("\n\n---\n\n")}`);
  }

  // ── 可用资源清单 ──
  const resourceLines: string[] = [];

  // 记忆索引
  if (agentCtx.memoryIndex) {
    resourceLines.push(
      `### memory/USER.md (Memory Index)\n\n${agentCtx.memoryIndex}\n\nThis is your memory directory. Read it to find memories relevant to the current task. Use \`read_file\` to load specific memory files.`,
    );
  }

  // 技能列表
  if (agentCtx.skills.length > 0) {
    const skillList = agentCtx.skills
      .map((s) => `- **${s.name}**: ${s.summary}`)
      .join("\n");
    resourceLines.push(
      `### Available Skills\n\n${skillList}\n\nWhen a task matches a skill, use \`read_file\` to load its full content from skills/<name>/SKILL.md, then follow its template exactly.`,
    );
  }

  if (resourceLines.length > 0) {
    parts.push(`## Available Resources\n\n${resourceLines.join("\n\n")}`);
  }

  // ── 工作指引（引导模型思考，不写死步骤） ──
  parts.push(`## How to Work

When the user gives you a task:
1. Understand the request and check your Working Style for guidance (e.g., confirm requirements before proceeding)
2. Read memory/USER.md to find relevant memories, then load specific memory files as needed
3. Check if a skill applies — if so, load and follow it
4. Complete the task using your tools
5. Summarize what you did — what was created, where it's saved

When the task is simple (a quick question or chat), skip steps that don't apply.
When information is insufficient, ask the user for clarification before proceeding.`);

  return parts.join("\n\n");
}
