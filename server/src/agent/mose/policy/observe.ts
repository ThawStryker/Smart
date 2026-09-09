import { isObserved } from "../core/session";
import { resolvePath } from "../core/fs";
import type { Session } from "../types";

/** 变更类工具在执行前拦截。返回拒绝原因，null 表示放行。 */
export function checkPolicy(
  name: string,
  args: Record<string, unknown>,
  session: Session,
  exists: boolean,
): string | null {
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
