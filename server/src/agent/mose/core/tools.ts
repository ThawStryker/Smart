import type { PhaseName } from "../phases";
import type { FileStore, Session } from "../types";
import { formatFileList, normalizeTableCellBreaks, resolvePath } from "./fs";
import { markObserved } from "./session";
import { splitMetaNotes } from "./deliverable";

export const TOOL_DEFS: Array<Record<string, unknown>> = [
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Read a workspace or agent file. Must be called before edit_file on that path.",
      parameters: {
        type: "object",
        properties: { path: { type: "string", description: "File path, e.g. workspace/lesson.md" } },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_files",
      description: "List files. Empty prefix lists the workspace. Use skills/ or memory/ for agent files.",
      parameters: {
        type: "object",
        properties: { prefix: { type: "string", description: "Path prefix filter" } },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description: "Create a NEW workspace file only. If the file already exists, use edit_file.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "File path (workspace/...)" },
          content: { type: "string", description: "Full markdown content" },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "edit_file",
      description: "Replace exact text in an existing file. old_string must match uniquely unless replace_all=true. Read the file first.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string" },
          old_string: { type: "string", description: "Exact text to find" },
          new_string: { type: "string", description: "Replacement text" },
          replace_all: { type: "boolean", description: "Replace every occurrence" },
        },
        required: ["path", "old_string", "new_string"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "skill_load",
      description: "Load full instructions for one skill by name. Call before writing if a listed skill matches the task.",
      parameters: {
        type: "object",
        properties: { name: { type: "string", description: "Skill name from the catalog" } },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "memory_recall",
      description: "Load the agent's stored memory (memory/MEMORY.md).",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "ask_user",
      description: "Stop and ask the user a question. Use when required information is missing. Do not write files in the same turn.",
      parameters: {
        type: "object",
        properties: { question: { type: "string", description: "The question to show the user" } },
        required: ["question"],
      },
    },
  },
];

export interface ToolExecResult {
  result: string;
  phase: PhaseName;
  meta?: Record<string, unknown>;
  stop?: boolean;
  writeContent?: string;
  writeMode?: "create" | "edit";
  notes?: string;
}

function countLiteral(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let pos = 0;
  while (true) {
    const i = haystack.indexOf(needle, pos);
    if (i === -1) break;
    count++;
    pos = i + needle.length;
  }
  return count;
}

function nl(s: string): string {
  return s.replace(/\r\n/g, "\n");
}

export async function dispatchTool(
  name: string,
  args: Record<string, unknown>,
  fs: FileStore,
  session: Session,
): Promise<ToolExecResult> {
  switch (name) {
    case "read_file": {
      const path = String(args.path || "");
      if (!path) return { result: "Error: path required", phase: "read" };
      const rec = await fs.read(path);
      if (!rec.exists) return { result: `File not found: ${rec.displayPath}`, phase: "read", meta: { path: rec.displayPath } };
      markObserved(session, rec.displayPath);
      const preloaded = rec.displayPath.startsWith("context/") ||
        ["AGENTS.md", "MEMORY.md", "USER.md", "memory/MEMORY.md", "memory/USER.md"].includes(rec.displayPath);
      return {
        result: rec.content,
        phase: "read",
        meta: preloaded ? undefined : { path: rec.displayPath },
      };
    }
    case "list_files": {
      const prefix = String(args.prefix || "");
      const files = await fs.list(prefix);
      return { result: formatFileList(files), phase: "read", meta: { prefix: prefix || "/" } };
    }
    case "write_file": {
      const path = String(args.path || "");
      const content = String(args.content || "");
      if (!path) return { result: "Error: path required", phase: "write" };
      if (!content) return { result: "Error: content required", phase: "write" };
      const rec = await fs.stat(path);
      const normalized = rec.kind === "workspace" ? normalizeTableCellBreaks(content) : content;
      const split = splitMetaNotes(normalized);
      const body = split.document || normalized;
      await fs.write(path, body);
      markObserved(session, rec.displayPath);
      return {
        result: `File created: ${rec.displayPath}`,
        phase: "write",
        meta: { path: rec.displayPath, mode: "create" },
        writeContent: body,
        writeMode: "create",
        notes: split.notes || undefined,
      };
    }
    case "edit_file": {
      const path = String(args.path || "");
      const oldString = nl(String(args.old_string ?? ""));
      const newString = nl(String(args.new_string ?? ""));
      const replaceAll = !!args.replace_all;
      if (!path) return { result: "Error: path required", phase: "write" };
      if (!oldString) return { result: "Error: old_string required", phase: "write" };
      const rec = await fs.read(path);
      if (!rec.exists) return { result: `File not found: ${rec.displayPath}`, phase: "write", meta: { path: rec.displayPath } };
      const current = nl(rec.content);
      const n = countLiteral(current, oldString);
      if (n === 0) {
        const snippet = current.slice(0, 400);
        return {
          result: `Error: old_string not found in ${rec.displayPath}. Read the file again.\n--- snippet ---\n${snippet}`,
          phase: "write",
          meta: { path: rec.displayPath, mode: "edit" },
        };
      }
      if (!replaceAll && n > 1) {
        return {
          result: `Error: old_string matched ${n} times in ${rec.displayPath}. Provide a unique snippet or set replace_all=true.`,
          phase: "write",
          meta: { path: rec.displayPath, mode: "edit" },
        };
      }
      const next = replaceAll ? current.split(oldString).join(newString) : current.replace(oldString, newString);
      const normalized = rec.kind === "workspace" ? normalizeTableCellBreaks(next) : next;
      const split = splitMetaNotes(normalized);
      const body = split.document || normalized;
      await fs.write(path, body);
      markObserved(session, rec.displayPath);
      return {
        result: `File edited: ${rec.displayPath}`,
        phase: "write",
        meta: { path: rec.displayPath, mode: "edit" },
        writeContent: body,
        writeMode: "edit",
        notes: split.notes || undefined,
      };
    }
    case "skill_load": {
      const skillName = String(args.name || "");
      if (!skillName) return { result: "Error: name required", phase: "skill" };
      const rec = await fs.read(`skills/${skillName}/SKILL.md`);
      if (!rec.exists) return { result: `Skill "${skillName}" not found.`, phase: "skill", meta: { name: skillName } };
      session.loadedSkills[skillName] = rec.content;
      session.events.push({ type: "skill", name: skillName, content: rec.content });
      return {
        result: `## Skill: ${skillName}\n\n${rec.content}`,
        phase: "skill",
        meta: { name: skillName },
      };
    }
    case "memory_recall": {
      const rec = await fs.read("memory/MEMORY.md");
      if (!rec.exists || !rec.content.trim()) return { result: "No memories stored yet.", phase: "memory" };
      markObserved(session, rec.displayPath);
      return { result: `## Agent Memory\n\n${rec.content}`, phase: "memory" };
    }
    case "ask_user": {
      const question = String(args.question || "").trim();
      if (!question) return { result: "Error: question required", phase: "text" };
      session.waitingForUser = true;
      return { result: question, phase: "text", stop: true };
    }
    default:
      return {
        result: `Unknown tool: ${name}. Available: read_file, list_files, write_file, edit_file, skill_load, memory_recall, ask_user`,
        phase: "text",
      };
  }
}

export { resolvePath };
