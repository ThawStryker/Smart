/** 从剪贴板还原逐字稿表格：丢掉 Word/飞书 HTML 里成片的空列，避免粘贴成几十列空格子。 */

function wrapCopiedText(text: string, marks: string[]): string {
  const lead = text.match(/^\s*/)?.[0] ?? "";
  const trail = text.match(/\s*$/)?.[0] ?? "";
  const core = text.slice(lead.length, text.length - trail.length);
  if (!core) return text;
  let s = core;
  if (marks.includes("strong")) s = `**${s}**`;
  if (marks.includes("emphasis") || marks.includes("em")) s = `*${s}*`;
  return `${lead}${s}${trail}`;
}

function sameMarks(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((name, i) => name === b[i]);
}

/** HTML 单元格 → markdown：br/hardbreak 变换行，strong 变成 **，换行不写进加粗里 */
export function cellHtmlToMarkdown(root: HTMLElement): string {
  type Part = { kind: "br" } | { kind: "text"; text: string; marks: string[] };
  const parts: Part[] = [];
  const walk = (node: globalThis.Node, marks: string[]) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = (node.textContent || "").replace(/\u00a0/g, " ");
      if (text) parts.push({ kind: "text", text, marks: [...marks].sort() });
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();
    if (tag === "br" || el.getAttribute("data-type") === "hardbreak") {
      parts.push({ kind: "br" });
      return;
    }
    let next = marks;
    if (tag === "strong" || tag === "b") next = [...marks, "strong"];
    else if (tag === "em" || tag === "i") next = [...marks, "emphasis"];
    if (/^(p|div|li|h[1-6])$/.test(tag) && parts.length) parts.push({ kind: "br" });
    el.childNodes.forEach((child) => walk(child, next));
    if (/^(p|div|li|h[1-6])$/.test(tag)) parts.push({ kind: "br" });
  };
  walk(root, []);
  const merged: Part[] = [];
  for (const part of parts) {
    const last = merged[merged.length - 1];
    if (part.kind === "text" && last?.kind === "text" && sameMarks(last.marks, part.marks)) {
      last.text += part.text;
    } else {
      merged.push(part.kind === "text" ? { kind: "text", text: part.text, marks: [...part.marks] } : { kind: "br" });
    }
  }
  return merged
    .map((part) => (part.kind === "br" ? "\n" : wrapCopiedText(part.text, part.marks)))
    .join("")
    .replace(/\r/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function cellText(td: HTMLElement): string {
  return cellHtmlToMarkdown(td);
}

/** HTML 片段（非表格）还原为带换行的纯文本 */
export function htmlToTextWithBreaks(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  return cellText(doc.body);
}

function dropEmptyColumns(matrix: string[][]): string[][] {
  if (!matrix.length) return matrix;
  const width = Math.max(...matrix.map((r) => r.length), 0);
  const keep: number[] = [];
  for (let c = 0; c < width; c++) {
    if (matrix.some((r) => (r[c] || "").trim())) keep.push(c);
  }
  if (!keep.length) return [];
  return matrix
    .map((r) => keep.map((c) => r[c] || ""))
    .filter((r) => r.some((cell) => cell.trim()));
}

function escapeCell(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/\n/g, "<br>");
}

export function matrixToGfm(matrix: string[][]): string | null {
  const slim = dropEmptyColumns(matrix);
  if (slim.length < 1) return null;
  const cols = slim[0].length;
  if (cols < 2) return null;
  const header = slim[0];
  const sep = Array.from({ length: cols }, () => "---");
  const lines = [
    `| ${header.map(escapeCell).join(" | ")} |`,
    `| ${sep.join(" | ")} |`,
    ...slim.slice(1).map((r) => `| ${r.map(escapeCell).join(" | ")} |`),
  ];
  return lines.join("\n");
}

export function htmlTablesToMatrix(html: string): string[][] | null {
  if (!/<table/i.test(html)) return null;
  const doc = new DOMParser().parseFromString(html, "text/html");
  const table = doc.querySelector("table");
  if (!table) return null;
  const rows = [...table.querySelectorAll("tr")].filter((tr) => tr.closest("table") === table);
  if (!rows.length) return null;
  const matrix = rows.map((tr) =>
    [...tr.children]
      .filter((el) => el.tagName === "TD" || el.tagName === "TH")
      .map((td) => cellText(td as HTMLElement)),
  );
  return matrix.length ? matrix : null;
}

export function tsvToMatrix(text: string): string[][] | null {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const rows = lines.map((line) => line.split("\t"));
  if (!rows.some((r) => r.length >= 2)) return null;
  return rows;
}

function isPipeSepLine(line: string): boolean {
  return /^\|\s*[-:]+(?:\s*\|\s*[-:]+)*\s*\|?\s*$/.test(line.trim());
}

function splitPipeRow(line: string): string[] {
  const raw = line.trim();
  const inner = raw.startsWith("|") ? raw.slice(1) : raw;
  const body = inner.endsWith("|") ? inner.slice(0, -1) : inner;
  const cells: string[] = [];
  let cur = "";
  for (let i = 0; i < body.length; i++) {
    if (body[i] === "\\" && body[i + 1] === "|") {
      cur += "|";
      i += 1;
      continue;
    }
    if (body[i] === "|") {
      cells.push(cur.trim());
      cur = "";
      continue;
    }
    cur += body[i];
  }
  cells.push(cur.trim());
  return cells.map((cell) => cell.replace(/<br\s*\/?>/gi, "\n"));
}

/** 把 GFM 管道表还原成矩阵，单元格里的 <br> 变成换行，** 原样保留 */
export function gfmTableToMatrix(text: string): string[][] | null {
  const rows = text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .filter((line) => line.trim().startsWith("|") && !isPipeSepLine(line))
    .map(splitPipeRow)
    .filter((row) => row.some((cell) => cell.trim()));
  if (!rows.length || rows[0].length < 2) return null;
  const cols = Math.max(...rows.map((row) => row.length));
  if (cols < 2) return null;
  return rows.map((row) => Array.from({ length: cols }, (_, i) => row[i] || ""));
}

function htmlHasCellFormat(html: string): boolean {
  return /<br\b|data-type=["']hardbreak["']|<strong\b|<b\b/i.test(html);
}

function textLooksLikeGfmTable(text: string): boolean {
  return /^\s*\|/m.test(text) && (/<br\s*\/?>/i.test(text) || text.includes("**") || text.includes("| ---"));
}

/** 剪贴板里是多列表格时返回矩阵；单列/普通文本返回 null */
export function tableMatrixFromClipboard(data: DataTransfer | null): string[][] | null {
  if (!data) return null;
  const html = data.getData("text/html") || "";
  const text = data.getData("text/plain") || "";
  const fromGfm = gfmTableToMatrix(text);
  // 复制 markdown 源码时 HTML 往往没有 table；有 ** / <br> 时以源码为准
  if (fromGfm && fromGfm[0].length >= 2 && textLooksLikeGfmTable(text) && !htmlHasCellFormat(html)) {
    const slim = dropEmptyColumns(fromGfm);
    if (slim.length && slim[0].length >= 2) return slim;
  }
  const fromHtml = htmlTablesToMatrix(html);
  if (fromHtml) {
    const slim = dropEmptyColumns(fromHtml);
    if (slim.length && slim[0].length >= 2) return slim;
  }
  if (fromGfm) {
    const slim = dropEmptyColumns(fromGfm);
    if (slim.length && slim[0].length >= 2) return slim;
  }
  const fromTsv = tsvToMatrix(text);
  if (fromTsv) {
    const slim = dropEmptyColumns(fromTsv);
    if (slim.length && slim[0].length >= 2) return slim;
  }
  return null;
}

/** 粘贴进格子：保留 br/段落换行。整表粘贴请用 tableMatrixFromClipboard。 */
export function clipboardTextWithBreaks(data: DataTransfer | null): string {
  if (!data) return "";
  const html = data.getData("text/html") || "";
  if (html) {
    const matrix = htmlTablesToMatrix(html);
    if (matrix) {
      const slim = dropEmptyColumns(matrix);
      if (slim.length && slim[0].length < 2) {
        return slim.map((r) => r[0] || "").join("\n").trim();
      }
    } else {
      const fromHtml = htmlToTextWithBreaks(html);
      if (fromHtml) return fromHtml;
    }
  }
  return (data.getData("text/plain") || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
}

/** 剪贴板里是表格时返回 GFM；普通文本返回 null，交给编辑器默认粘贴 */
export function tableMarkdownFromClipboard(data: DataTransfer | null): string | null {
  const matrix = tableMatrixFromClipboard(data);
  return matrix ? matrixToGfm(matrix) : null;
}
