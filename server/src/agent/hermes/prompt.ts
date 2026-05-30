/**
 * Three-tier system prompt assembly — inspired by Hermes Agent's system_prompt.py.
 *
 * Stable   — identity, role definition, skills (full content), tool guidance,
 *            platform hints, workflow. Built once, reused across turns.
 * Context  — background knowledge, user preferences. Session-stable.
 * Volatile — agent memory, session info. Per-turn.
 */
import type { AgentFileContext } from "./types";

// ── Workflow paradigm (precedes everything) ──

const WORKFLOW = `## Agent Workflow

You operate in a structured 5-step workflow. Follow these steps IN ORDER for every task.

### Step 1: INFORMATION CHECK
Before taking any action:
- Read your context files and memory for task requirements
- Check if the user's request provides all necessary information
- If critical information is missing (e.g., topic, audience, goals, format), ASK the user before proceeding
- Do NOT make assumptions about missing information

### Step 2: FORMAT SELECTION
Identify the correct output format for this task:
- Check loaded skills for format specifications
- Check memory files (e.g., work-templates.md) for format templates
- Skills may contain BOTH a general outline AND a specific format example
- **The format example (usually a table) is the actual output format — it overrides any general outline**
- When multiple format specifications exist, the most SPECIFIC one wins (table > headings > plain text)
- State your format choice explicitly before generating content

### Step 3: CONTENT GENERATION
Generate the complete document following the selected format EXACTLY:
- Match the column structure, field names, and layout from the format example
- Use IP characters, dialogue styles, and terminology as specified
- Do NOT convert tables to headings, headings to lists, or any other format transformation
- The format example shows you HOW to output — copy its structure precisely

### Step 4: SAVE TO WORKSPACE
- Use write_file to save the complete content to workspace/<filename>.md
- The file content must be the EXACT output from Step 3, with no additions or modifications
- write_file is a SAVE operation, not a composition tool

### Step 5: SUMMARIZE IN CONVERSATION
- In conversation, output only a brief completion summary
- Include: what was created, document structure, key decisions
- Do NOT repeat the document content in conversation`;

// ── Guidance constants ──

export const MEMORY_GUIDANCE =
  "You have a memory_save tool for persistent memory. Save durable facts: " +
  "user preferences, effective approaches, tool quirks. " +
  "Keep entries short (1-2 sentences). After a task, if you learned something " +
  "reusable, save it. Do NOT save task progress or temporary state.";

export const SKILLS_GUIDANCE =
  "Skills are loaded below with their full content. Study them carefully, " +
  "especially any format examples. The format example section defines how your output should be structured.";

export const TOOL_ENFORCEMENT =
  "You MUST use your tools to take action. When you say you will perform an " +
  "action, immediately make the tool call in the same response. " +
  "Keep working until the task is complete.";

// ── Agent names from userAgents table ──

interface SkillEntry { name: string; summary: string; entry: string; }

// ── Stable tier ──

function buildStable(
  agentName: string,
  agentCtx: AgentFileContext,
  availableAgents: string[],
  validToolNames: Set<string>,
): string {
  const parts: string[] = [];

  // 1. Identity
  parts.push(
    `You are ${agentName}, an AI agent configured with specific skills and instructions. ` +
    "Follow your workflow precisely. Be thorough and accurate.",
  );

  // 2. Workflow paradigm (MUST come before role/skills)
  parts.push(WORKFLOW);

  // 3. Role definition (AGENTS.md)
  if (agentCtx.agentsMd) {
    parts.push(`## Role\n\n${agentCtx.agentsMd}`);
  }

  // 4. Tool-aware guidance
  const guidance: string[] = [];
  if (validToolNames.has("memory_save")) guidance.push(MEMORY_GUIDANCE);
  if (agentCtx.skills.length > 0) guidance.push(SKILLS_GUIDANCE);
  if (guidance.length > 0) parts.push(guidance.join(" "));

  // 5. Skills — FULL content in system prompt
  if (agentCtx.skills.length > 0) {
    const blocks = agentCtx.skills.map((s: SkillEntry) => {
      return `### Skill: ${s.name}\n\n${s.entry}\n`;
    });
    parts.push(`## Skills\n\n${blocks.join("\n---\n\n")}`);
  }

  // 6. Available agents
  const others = availableAgents.filter((a) => a !== agentName);
  if (others.length > 0) {
    parts.push(`## Available Agents\n\nYou can delegate work to: ${others.join(", ")}. Use \`call_agent\` to assign tasks.`);
  }

  // 7. Tool enforcement
  parts.push(TOOL_ENFORCEMENT);

  // 8. Platform hints
  parts.push("Today's date: " + new Date().toISOString().slice(0, 10));

  return parts.join("\n\n");
}

// ── Context tier ──

function buildContext(agentCtx: AgentFileContext): string {
  const parts: string[] = [];

  if (agentCtx.contexts.length > 0) {
    parts.push(`## Background Knowledge\n\n${agentCtx.contexts.join("\n\n---\n\n")}`);
  }
  if (agentCtx.userMd) {
    parts.push(`## User Preferences\n\n${agentCtx.userMd}`);
  }

  return parts.join("\n\n");
}

// ── Volatile tier ──

function buildVolatile(agentCtx: AgentFileContext): string {
  const parts: string[] = [];

  if (agentCtx.memoryMd) {
    parts.push(`## Agent Memory\n\n${agentCtx.memoryMd}`);
  }

  return parts.join("\n\n");
}

// ── Main assembly ──

export function buildSystemPrompt(
  agentName: string,
  agentCtx: AgentFileContext,
  availableAgents: string[],
  validToolNames: Set<string>,
): { stable: string; context: string; volatile: string; full: string } {
  const stable = buildStable(agentName, agentCtx, availableAgents, validToolNames);
  const context = buildContext(agentCtx);
  const volatile = buildVolatile(agentCtx);

  const full = [stable, context, volatile].filter(Boolean).join("\n\n");
  return { stable, context, volatile, full };
}
