import { isObserved } from "../core/session";
import { listTarget, resolvePath } from "../core/fs";
import type { Session } from "../types";

export interface PolicyCtx {
  focusFile?: string | null;
  memoryIndex?: Array<{ path: string }>;
}

function lastUserText(session: Session): string {
  for (let i = session.events.length - 1; i >= 0; i--) {
    const e = session.events[i];
    if (e.type === "user") return e.text || "";
  }
  return "";
}

/** 用户明确要求看工作区目录时才允许 list */
export function userAskedToBrowseWorkspace(text: string): boolean {
  return /列出(文件|文档|工作区)|文件列表|有哪些文件|工作区(里|中)?(有哪些|都有)|现有(的)?(文档|课稿|文件)/.test(text);
}

function namedInThisTurn(displayPath: string, user: string): boolean {
  if (!user) return false;
  const rel = displayPath.replace(/^workspace\//, "");
  const base = rel.split("/").pop() || rel;
  if (base.length < 2) return false;
  return user.includes(displayPath) || user.includes(rel) || user.includes(`#${rel}`) || user.includes(`#${base}`);
}

function workspaceReadAllowed(displayPath: string, session: Session, focusFile?: string | null): boolean {
  if (focusFile && resolvePath(focusFile).displayPath === displayPath) return true;
  const user = lastUserText(session);
  if (namedInThisTurn(displayPath, user)) return true;
  // 本轮已指定另一份文档时，禁止去读上一轮工作区成稿
  if (focusFile) return false;
  if (isObserved(session, displayPath)) return true;
  return false;
}

function checkWorkspaceBrowse(
  name: string,
  args: Record<string, unknown>,
  session: Session,
  focusFile?: string | null,
): string | null {
  if (name === "list_files") {
    const target = listTarget(String(args.prefix || ""));
    if (target.kind !== "workspace") return null;
    if (userAskedToBrowseWorkspace(lastUserText(session))) return null;
    return "Error: Do not list the workspace. Only list workspace files if the user asked to see existing documents. Create a new file or read the file named / pinned this turn.";
  }
  if (name === "read_file") {
    const rec = resolvePath(String(args.path || ""));
    if (rec.kind !== "workspace") return null;
    if (workspaceReadAllowed(rec.displayPath, session, focusFile)) return null;
    return `Error: Do not read ${rec.displayPath}. Only read the file you will edit, a file the user named, or the pinned document. Do not browse other workspace files.`;
  }
  return null;
}

/** 工具执行前拦截。返回拒绝原因，null 表示放行。 */
export function checkPolicy(
  name: string,
  args: Record<string, unknown>,
  session: Session,
  exists: boolean,
  ctx?: PolicyCtx,
): string | null {
  const browse = checkWorkspaceBrowse(name, args, session, ctx?.focusFile);
  if (browse) return browse;

  if (name === "skill_load") {
    const unread = (ctx?.memoryIndex || []).filter((m) => !isObserved(session, m.path));
    if (unread.length > 0) {
      return `Error: Context is already loaded. Read relevant memory files first, then skill_load. Still unread: ${unread.map((m) => m.path).join(", ")}`;
    }
    return null;
  }

  if (name === "write_file" || name === "edit_file") {
    const raw = String(args.path || "");
    if (raw) {
      const { displayPath } = resolvePath(raw);
      if (displayPath === "memory/MEMORY.md" || displayPath === "MEMORY.md") {
        return "Error: memory/MEMORY.md is written by the user. Do not change it.";
      }
    }
  }

  if (name === "write_file") {
    const path = String(args.path || "");
    if (!path) return "Error: write_file requires path";
    if (exists) {
      const { displayPath } = resolvePath(path);
      return `Error: ${displayPath} already exists. Use edit_file to change it. Do NOT overwrite with write_file.`;
    }
    return null;
  }

  if (name === "edit_file") {
    const path = String(args.path || "");
    if (!path) return "Error: edit_file requires path";
    const { displayPath } = resolvePath(path);
    if (!exists) {
      return `Error: ${displayPath} not found. Use write_file to create a new file.`;
    }
    if (!isObserved(session, displayPath)) {
      return `Error: ${displayPath} has not been read in this session. Call read_file first, then edit_file.`;
    }
    return null;
  }

  return null;
}
