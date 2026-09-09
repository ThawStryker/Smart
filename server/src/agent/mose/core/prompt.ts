import type { PromptContext, Session } from "../types";

export function buildSystemPrompt(ctx: PromptContext, session: Session): string {
  const parts: string[] = [];

  if (ctx.agentsMd) {
    parts.push(`## Role\n\n${ctx.agentsMd}`);
  }

  if (ctx.context.length > 0) {
    parts.push(`## Context (pre-loaded)\n\n${ctx.context.join("\n\n---\n\n")}`);
  }

  if (ctx.userMd) {
    parts.push(`## User Memory\n\n${ctx.userMd}`);
  }
  if (ctx.memoryMd) {
    parts.push(`## Agent Memory\n\n${ctx.memoryMd}`);
  }

  if (ctx.skillCatalog.length > 0) {
    const list = ctx.skillCatalog.map((s) => `- **${s.name}**: ${s.description}`).join("\n");
    parts.push(`## Available Skills\n\nUse skill_load to load full instructions for a matching skill. Do not guess a skill's template.\n\n${list}`);
  }

  const loaded = Object.entries(session.loadedSkills);
  if (loaded.length > 0) {
    const blocks = loaded.map(([name, body]) => `### ${name}\n\n${body}`).join("\n\n---\n\n");
    parts.push(`## Loaded Skills\n\nFollow these instructions exactly.\n\n${blocks}`);
  }

  if (ctx.memoryIndex.length > 0) {
    const list = ctx.memoryIndex.map((m) => `- \`${m.path}\` — ${m.summary}`).join("\n");
    parts.push(`## Memory Files\n\nUse read_file to load a file when needed.\n\n${list}`);
  }

  parts.push(`## Tools
- read_file / list_files: inspect files. You MUST read a file before editing it.
- write_file: create a NEW file only. Existing files will be rejected.
- edit_file: change an existing file with a unique old_string. Prefer this over rewriting.
- skill_load: load one skill's full body before producing a deliverable that matches it.
- memory_recall: load stored memory when relevant.
- ask_user: stop and ask when required information is missing. Do not write in the same turn.

## Output
- File bodies go ONLY through write_file / edit_file. Never paste the document into visible text.
- Use the thinking channel for planning. Visible text is a short user-facing reply only.
- After creating or editing a file, reply with ONE sentence: which file and what it contains.
- Coverage checks such as 教学目标覆盖说明 belong in visible text, never inside the file.
- Do not dump checklists, audit tables, or internal review notes into the document.`);

  return parts.join("\n\n");
}
