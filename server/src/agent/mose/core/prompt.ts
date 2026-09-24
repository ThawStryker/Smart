import type { PromptContext, Session } from "../types";

const YUMI_FILE_LIMIT = 40_000;

export type YumiPinned =
  | { path: string; content: string }
  | { path: string; missing: true };

/** 未指定 Agent 时的直聊角色。指定了工作区文档时把全文放进提示，Yumi 没有 read_file 工具。 */
export function buildYumiPrompt(pinned?: YumiPinned | null): string {
  const role = "你是 Yumi，Smart 工作台的对话助手。用中文回复。你的名字是 Yumi，不要自称 DeepSeek 或其它模型。";
  if (!pinned) return role;
  if ("missing" in pinned) {
    return `${role}\n\n用户指定了 \`${pinned.path}\`，但工作区里没有这份文件。如实说明找不到，不要说没有读取权限。`;
  }
  const body = pinned.content.length > YUMI_FILE_LIMIT
    ? pinned.content.slice(0, YUMI_FILE_LIMIT) + "\n\n[文档过长，已截断]"
    : pinned.content;
  return `${role}\n\n用户本轮指定了工作区文档 \`${pinned.path}\`。下面是文件全文。根据它回答，不要说没有权限或读不到文件，也不要让用户再粘贴一遍。\n\n---\n${body}\n---`;
}

export function buildSystemPrompt(ctx: PromptContext, session: Session, focusFile?: string | null): string {
  const parts: string[] = [];

  if (ctx.agentsMd) {
    parts.push(`## Role\n\n${ctx.agentsMd}`);
  }

  if (ctx.context.length > 0) {
    parts.push(`## Context (pre-loaded)\n\nThese files are already fully loaded. Do not read_file anything under context/.\n\n${ctx.context.join("\n\n---\n\n")}`);
  }

  parts.push(`## User Memory\n\nLasting conventions from conversation with this user. When the user sets a new standing preference, rule, or ban, edit_file \`memory/USER.md\` to append it. Do not put skill or tool instructions here. Do not write_file-overwrite it.\n\n${ctx.userMd || "(empty)"}`);
  parts.push(`## Agent Memory\n\nThe user wrote this in advance for the agent to remember. Follow it. Do not edit \`memory/MEMORY.md\`.\n\n${ctx.memoryMd || "(empty)"}`);

  if (ctx.memoryIndex.length > 0) {
    const list = ctx.memoryIndex.map((m) => `- \`${m.path}\` — ${m.summary}`).join("\n");
    parts.push(`## Memory Files\n\nAfter using Context, read_file every listed file that matches this task. Do this before skill_load.\n\n${list}`);
  }

  if (ctx.skillCatalog.length > 0) {
    const list = ctx.skillCatalog.map((s) => `- **${s.name}**: ${s.description}`).join("\n");
    parts.push(`## Available Skills\n\nOnly skill_load after relevant memory files have been read. Do not guess a skill's template.\n\n${list}`);
  }

  const loaded = Object.entries(session.loadedSkills);
  if (loaded.length > 0) {
    const blocks = loaded.map(([name, body]) => `### ${name}\n\n${body}`).join("\n\n---\n\n");
    parts.push(`## Loaded Skills\n\nFollow these instructions exactly.\n\n${blocks}`);
  }

  if (focusFile) {
    parts.push(`## 指定文档\n\n用户本轮指定了 \`${focusFile}\`。先 \`read_file\` 读取它。这是本轮任务的输入，不要把上一轮写过的其它工作区文件当成当前目标。\n- 用户要改这份文件：用 \`edit_file\`，不要另存。\n- 用户要基于它另写新文件（例如根据逐字稿写教案）：\`write_file\` 到新路径，不要改指定文档，也不要去改上一轮的成稿，除非用户本轮点名那份文件。`);
  }

  parts.push(`## Workflow
1. Understand the user request. Use ask_user if required information is missing.
2. Context, USER.md, and MEMORY.md are already fully loaded. Do not read_file context/.
3. Read relevant Memory Files for this task. Do not skill_load until those reads are done.
4. skill_load at most one matching skill. Follow that skill's body for the deliverable format. Do not guess a template.
5. Then write_file or edit_file. To edit an existing workspace file: read_file that one path, then edit_file. Do not browse other workspace files.

## Tools
- read_file: read matching memory/ files before skill_load; also required before edit_file on a workspace path. Do not read context/.
- list_files: agent paths only (skills/ or memory/). Do not list the workspace unless the user asked to see existing files.
- write_file: create a NEW file only. Existing files will be rejected.
- edit_file: change an existing file with a unique old_string. Prefer this over rewriting. Allowed on memory/USER.md. Forbidden on memory/MEMORY.md.
- skill_load: load one skill's full body only after relevant memory has been read.
- memory_recall: reload memory/MEMORY.md when needed. Do not use it to rewrite MEMORY.md.
- ask_user: stop and ask when required information is missing. Do not write in the same turn.

## Output
- File bodies go ONLY through write_file / edit_file. Never paste the document into visible text.
- Use the thinking channel for planning. Visible text is a short user-facing reply only.
- After creating or editing a file, reply with ONE sentence: which file and what it contains.
- Coverage checks such as 教学目标覆盖说明 belong in visible text, never inside the file.
- Do not dump checklists, audit tables, or internal review notes into the document.`);

  return parts.join("\n\n");
}
