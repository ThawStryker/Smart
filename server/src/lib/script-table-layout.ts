/** 教学逐字稿四列表：按用户调过的列宽写进表后注释。只在新建时补，不改已有自定义宽。 */

export const SCRIPT_TABLE_COLS = [0.1475, 0.1761, 0.1546, 0.5218] as const;
export const SCRIPT_TABLE_COMMENT = `<!-- smart-table cols="${SCRIPT_TABLE_COLS.join(",")}" -->`;

const HEADER_RE = /\| *环节 *\| *任务卡名称 *\| *资源类型 *\| *教学逐字稿 *\|/;
const COMMENT_RE = /<!--\s*smart-table\b/;

export function looksLikeScriptTable(md: string): boolean {
  return HEADER_RE.test(md);
}

/** 新建逐字稿时补上列宽注释；文件里已经有 smart-table 注释就不动。 */
export function ensureScriptTableLayout(path: string, md: string): string {
  if (!path.toLowerCase().endsWith(".md")) return md;
  if (!looksLikeScriptTable(md)) return md;
  if (COMMENT_RE.test(md)) return md;
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  let last = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim().startsWith("|")) last = i;
  }
  if (last < 0) return md;
  const before = lines.slice(0, last + 1);
  const after = lines.slice(last + 1);
  while (after.length && after[0].trim() === "") after.shift();
  return [...before, SCRIPT_TABLE_COMMENT, ...after].join("\n").replace(/\s*$/, "\n");
}
