/** Markdown 管线表存不下宽高，用表后注释进出。增删行列暂不处理，对不上就回均分/自动高。 */

export const MD_COL_MIN = 0.08;
export const MD_ROW_MIN = 36;

const COMMENT_RE = /^<!--\s*smart-table\b([^>]*)-->\s*$/;

export interface MdTableLayout {
  cols?: number[];
  rows?: number[];
}

function parseColList(raw: string | undefined): number[] | undefined {
  if (!raw) return undefined;
  const values = raw.split(",").map((item) => Number(item.trim())).filter((item) => Number.isFinite(item) && item > 0);
  return values.length ? values : undefined;
}

function parseRowList(raw: string | undefined): number[] | undefined {
  if (!raw) return undefined;
  const values = raw.split(",").map((item) => Number(item.trim()));
  if (!values.length || values.some((item) => !Number.isFinite(item) || item < 0)) return undefined;
  return values;
}

function attr(blob: string, name: string): string | undefined {
  const match = blob.match(new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, "i"));
  return match?.[1];
}

export function parseLayoutComment(line: string): MdTableLayout | null {
  const match = line.trim().match(COMMENT_RE);
  if (!match) return null;
  const cols = parseColList(attr(match[1], "cols"));
  const rows = parseRowList(attr(match[1], "rows"));
  if (!cols && !rows) return {};
  return { ...(cols ? { cols } : {}), ...(rows ? { rows } : {}) };
}

function compact(value: number): string {
  return value.toFixed(4).replace(/\.?0+$/, "");
}

export function isEqualCols(cols: number[]): boolean {
  if (cols.length === 0) return true;
  const share = 1 / cols.length;
  return cols.every((width) => Math.abs(width - share) < 0.004);
}

export function formatLayoutComment(layout?: MdTableLayout | null): string {
  if (!layout) return "";
  const cols = layout.cols?.length ? normalizeCols(layout.cols, layout.cols.length) : undefined;
  const rows = layout.rows?.some((height) => height > 0) ? layout.rows.map((height) => Math.max(0, Math.round(height))) : undefined;
  const hasCols = Boolean(cols && !isEqualCols(cols));
  const hasRows = Boolean(rows?.some((height) => height > 0));
  if (!hasCols && !hasRows) return "";
  const parts: string[] = [];
  if (hasCols && cols) parts.push(`cols="${cols.map(compact).join(",")}"`);
  if (hasRows && rows) parts.push(`rows="${rows.join(",")}"`);
  return `<!-- smart-table ${parts.join(" ")} -->`;
}

export function normalizeCols(cols: number[] | undefined, count: number): number[] {
  if (count <= 0) return [];
  if (!cols || cols.length !== count || cols.some((width) => !(width > 0))) {
    return Array.from({ length: count }, () => 1 / count);
  }
  const sum = cols.reduce((total, width) => total + width, 0) || 1;
  return cols.map((width) => width / sum);
}

export function normalizeRows(rows: number[] | undefined, count: number): number[] {
  if (count <= 0) return [];
  return Array.from({ length: count }, (_, index) => {
    const height = rows?.[index];
    return height && height > 0 ? Math.max(MD_ROW_MIN, Math.round(height)) : 0;
  });
}

export function resizeCols(widths: number[], index: number, delta: number): number[] {
  if (index < 0 || index >= widths.length - 1) return widths;
  const next = [...widths];
  let shift = delta;
  if (next[index] + shift < MD_COL_MIN) shift = MD_COL_MIN - next[index];
  if (next[index + 1] - shift < MD_COL_MIN) shift = next[index + 1] - MD_COL_MIN;
  next[index] += shift;
  next[index + 1] -= shift;
  return next;
}

export function clampRowHeight(height: number): number {
  return Math.max(MD_ROW_MIN, Math.round(height));
}

function isPipe(line: string): boolean {
  return line.trim().startsWith("|");
}

/** 打开：抽出每张表后面的注释，正文里不再带它。 */
export function stripTableLayouts(md: string): { md: string; layouts: MdTableLayout[] } {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  const layouts: MdTableLayout[] = [];
  let i = 0;
  while (i < lines.length) {
    if (!isPipe(lines[i])) {
      out.push(lines[i]);
      i += 1;
      continue;
    }
    while (i < lines.length && isPipe(lines[i])) {
      out.push(lines[i]);
      i += 1;
    }
    let j = i;
    while (j < lines.length && lines[j].trim() === "") j += 1;
    const parsed = parseLayoutComment(lines[j] || "");
    if (parsed) {
      layouts.push(parsed);
      i = j + 1;
    } else {
      layouts.push({});
    }
  }
  return { md: out.join("\n"), layouts };
}

/** 保存：按表的出现顺序把注释写回表后。 */
export function persistTableLayouts(md: string, layouts: MdTableLayout[]): string {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let i = 0;
  let t = 0;
  while (i < lines.length) {
    if (!isPipe(lines[i])) {
      out.push(lines[i]);
      i += 1;
      continue;
    }
    while (i < lines.length && isPipe(lines[i])) {
      out.push(lines[i]);
      i += 1;
    }
    let j = i;
    while (j < lines.length && lines[j].trim() === "") j += 1;
    if (parseLayoutComment(lines[j] || "")) i = j + 1;
    const comment = formatLayoutComment(layouts[t]);
    t += 1;
    if (comment) out.push(comment);
  }
  return out.join("\n");
}
