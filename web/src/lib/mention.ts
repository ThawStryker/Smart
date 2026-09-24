/** 从消息里解析 @Agent，优先匹配最长全名（支持空格，如 教研 (02)） */
export function extractMention(text: string, agentNames: string[]): string | null {
  return extractToken(text, "@", agentNames);
}

/** 从消息里解析 #工作区文档 */
export function extractFileMention(text: string, fileNames: string[]): string | null {
  return extractToken(text, "#", fileNames);
}

function extractToken(text: string, trigger: "@" | "#", names: string[]): string | null {
  const sorted = [...new Set(names)].sort((a, b) => b.length - a.length);
  let from = 0;
  while (from < text.length) {
    const i = text.indexOf(trigger, from);
    if (i < 0) return null;
    if (trigger === "#" && i > 0 && !/\s/.test(text[i - 1]!)) {
      from = i + 1;
      continue;
    }
    const rest = trigger === "#" ? text.slice(i + 1).replace(/^[ \t]+/, "") : text.slice(i + 1);
    for (const name of sorted) {
      const n = trigger === "#" ? name.replace(/^workspace\//, "") : name;
      if (rest === n || rest === name) return n;
      if (rest.startsWith(n) && (rest.length === n.length || /[\s,，。！？;；]/.test(rest[n.length]!))) {
        return n;
      }
    }
    from = i + 1;
  }
  return null;
}

export type MentionKind = "agent" | "file";

/** 光标前未闭合的 @ 查询（允许空格，方便搜「教研 (02)」） */
export function mentionQuery(beforeCursor: string, agentNames: string[] = []): string | null {
  return tokenQuery(beforeCursor, "@", agentNames);
}

/** 光标前未闭合的 # 文档查询 */
export function fileMentionQuery(beforeCursor: string, fileNames: string[] = []): string | null {
  return tokenQuery(beforeCursor, "#", fileNames);
}

function tokenQuery(beforeCursor: string, trigger: "@" | "#", names: string[]): string | null {
  let at = beforeCursor.lastIndexOf(trigger);
  if (trigger === "#") {
    at = lastHashTrigger(beforeCursor);
  }
  if (at < 0) return null;
  const after = beforeCursor.slice(at + 1);
  if (after.includes("\n")) return null;
  if (trigger === "#" && (after.startsWith(" ") || after.startsWith("#"))) return null;

  const sorted = [...new Set(names)].sort((a, b) => b.length - a.length);
  for (const name of sorted) {
    if (after.startsWith(name) && after.length > name.length && /[\s,，。！？;；]/.test(after[name.length]!)) {
      const stillTypingLongerName = sorted.some((n) => n.length > after.length && n.startsWith(after));
      if (!stillTypingLongerName) return null;
    }
  }
  return after;
}

export function lastHashTrigger(s: string): number {
  for (let i = s.length - 1; i >= 0; i--) {
    if (s[i] !== "#") continue;
    if (i === 0 || /\s/.test(s[i - 1]!)) return i;
  }
  return -1;
}

/** 光标处当前补全：@ Agent 或 # 文档，取更靠近光标且未闭合的那个 */
export function activeMention(
  beforeCursor: string,
  agentNames: string[],
  fileNames: string[],
): { kind: MentionKind; query: string } | null {
  const at = beforeCursor.lastIndexOf("@");
  const hash = lastHashTrigger(beforeCursor);
  const atQ = mentionQuery(beforeCursor, agentNames);
  const hashQ = fileMentionQuery(beforeCursor, fileNames);
  if (atQ !== null && hashQ !== null) {
    return at >= hash ? { kind: "agent", query: atQ } : { kind: "file", query: hashQ };
  }
  if (hashQ !== null) return { kind: "file", query: hashQ };
  if (atQ !== null) return { kind: "agent", query: atQ };
  return null;
}

export function fileLabel(path: string): string {
  const rel = path.startsWith("workspace/") ? path.slice("workspace/".length) : path;
  const parts = rel.split("/");
  return parts[parts.length - 1] || rel;
}
