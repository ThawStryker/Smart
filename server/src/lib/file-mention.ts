function sortedNames(names: string[]): string[] {
  return [...new Set(names)].sort((a, b) => b.length - a.length);
}

function lastHashTrigger(s: string): number {
  for (let i = s.length - 1; i >= 0; i--) {
    if (s[i] !== "#") continue;
    if (i === 0 || /\s/.test(s[i - 1]!)) return i;
  }
  return -1;
}

/** 从消息里解析 #工作区文档（相对 workspace 的路径） */
export function extractFileMention(text: string, fileNames: string[]): string | null {
  const names = sortedNames(fileNames);
  let from = 0;
  while (from < text.length) {
    const i = text.indexOf("#", from);
    if (i < 0) return null;
    if (i > 0 && !/\s/.test(text[i - 1]!)) {
      from = i + 1;
      continue;
    }
    // 允许 `#逐字稿.md` 和 `# 逐字稿.md`（芯片展示带空格）
    const rest = text.slice(i + 1).replace(/^[ \t]+/, "");
    for (const name of names) {
      const n = name.replace(/^workspace\//, "");
      if (rest === n || rest === name) return n;
      if (rest.startsWith(n) && (rest.length === n.length || /[\s,，。！？;；]/.test(rest[n.length]!))) {
        return n;
      }
    }
    from = i + 1;
  }
  return null;
}

export function stripFileMentions(text: string, fileNames: string[]): string {
  let out = text;
  for (const name of sortedNames(fileNames)) {
    const n = name.replace(/^workspace\//, "");
    const escaped = n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(`(?:^|\\s)#\\s*${escaped}(?=$|[\\s,，。！？;；])`, "g"), " ");
  }
  return out.replace(/\s+/g, " ").trim() || text.trim();
}

export function toWorkspacePath(rel: string): string {
  const p = rel.replace(/^\/+/, "");
  return p.startsWith("workspace/") ? p : `workspace/${p}`;
}

/** 引擎看到的用户句：本轮指定文档写进正文，避免只靠 system 里的「指定文档」被上一轮成稿盖掉 */
export function withFocusFile(text: string, focusFile: string | null | undefined): string {
  const body = (text || "").trim();
  if (!focusFile) return body;
  const path = toWorkspacePath(focusFile);
  if (body.includes(path) || body.startsWith("用户本轮指定文档：")) return body;
  return `用户本轮指定文档：${path}\n${body}`;
}

export { lastHashTrigger };
