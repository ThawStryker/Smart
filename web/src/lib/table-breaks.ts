import type { Node } from "@milkdown/kit/prose/model";
import type { EditorView } from "@milkdown/kit/prose/view";
import { matrixToGfm } from "./paste-table";

/** 表格单元格里的换行占位：GFM 一行里不能写真换行，打开后再还原成 hardbreak */
export const CELL_BR_TOKEN = "\u2028";

export type CellInlinePart =
  | { kind: "br" }
  | { kind: "text"; text: string; marks: string[] };

function sameMarks(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((name, i) => name === b[i]);
}

/** 加粗/斜体包在文本两侧；换行绝不能写进 ** 里面，否则 GFM 拆对，重新打开会变成字面星号 */
export function wrapMarkedText(text: string, marks: string[]): string {
  if (!text) return "";
  const lead = text.match(/^\s*/)?.[0] ?? "";
  const trail = text.match(/\s*$/)?.[0] ?? "";
  const core = text.slice(lead.length, text.length - trail.length);
  if (!core) return text;
  if (marks.includes("code") || marks.includes("inlineCode")) {
    return `${lead}\`${core.replace(/`/g, "\\`")}\`${trail}`;
  }
  let s = core;
  if (marks.includes("strong")) s = `**${s}**`;
  if (marks.includes("emphasis") || marks.includes("em")) s = `*${s}*`;
  return `${lead}${s}${trail}`;
}

export function cellPartsToMarkdown(parts: CellInlinePart[]): string {
  const merged: CellInlinePart[] = [];
  for (const part of parts) {
    const last = merged[merged.length - 1];
    if (part.kind === "text" && last?.kind === "text" && sameMarks(last.marks, part.marks)) {
      last.text += part.text;
    } else if (part.kind === "text") {
      merged.push({ kind: "text", text: part.text, marks: [...part.marks] });
    } else {
      merged.push({ kind: "br" });
    }
  }
  return merged
    .map((part) => (part.kind === "br" ? "\n" : wrapMarkedText(part.text, part.marks)))
    .join("");
}

function collectCellParts(node: Node, parts: CellInlinePart[]): void {
  node.forEach((child) => {
    if (child.type.name === "hardbreak" || child.type.name === "hard_break") {
      parts.push({ kind: "br" });
      return;
    }
    if (child.isText) {
      parts.push({
        kind: "text",
        text: child.text || "",
        marks: child.marks.map((mark) => mark.type.name).sort(),
      });
      return;
    }
    collectCellParts(child, parts);
  });
}

/** 单元格内联：hardbreak → 换行，strong → **text**（先闭合再换行） */
export function serializeCellInlines(cell: Node): string {
  const parts: CellInlinePart[] = [];
  collectCellParts(cell, parts);
  return cellPartsToMarkdown(parts);
}

export function tableNodeToMatrix(table: Node): string[][] {
  const rows: string[][] = [];
  table.forEach((row) => {
    const name = row.type.name;
    if (name !== "table_row" && name !== "table_header_row") return;
    const cells: string[] = [];
    row.forEach((cell) => {
      if (cell.type.name === "table_cell" || cell.type.name === "table_header") {
        cells.push(serializeCellInlines(cell).replace(/\r\n/g, "\n"));
      }
    });
    if (cells.length) rows.push(cells);
  });
  return rows;
}

export function gfmTablesFromDoc(doc: Node): string[] {
  const out: string[] = [];
  doc.descendants((node) => {
    if (node.type.name === "table") {
      const gfm = matrixToGfm(tableNodeToMatrix(node));
      if (gfm) out.push(gfm);
      return false;
    }
    return true;
  });
  return out;
}

/** 按出现顺序，用带 <br> 的表替换 markdown 里以 | 开头的连续表行 */
export function replacePipeTables(md: string, tables: string[]): string {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let i = 0;
  let t = 0;
  while (i < lines.length) {
    if (lines[i].trim().startsWith("|")) {
      const start = i;
      while (i < lines.length && lines[i].trim().startsWith("|")) i++;
      out.push(tables[t] ?? lines.slice(start, i).join("\n"));
      t += 1;
    } else {
      out.push(lines[i]);
      i += 1;
    }
  }
  return out.join("\n");
}

/** 保存：从编辑器文档取出单元格换行，写成 GFM 的 <br> */
export function persistTableCellBreaks(md: string, doc: Node): string {
  const tables = gfmTablesFromDoc(doc);
  if (!tables.length) return md;
  return replacePipeTables(md, tables);
}

/** 打开：表行里的 <br> 先变成行分隔符，避免被 remark 丢掉 */
export function brToLineSepInTables(md: string): string {
  return md.replace(/\r\n/g, "\n").split("\n").map((line) => {
    if (!line.trim().startsWith("|")) return line;
    return line.replace(/<br\s*\/?>/gi, CELL_BR_TOKEN);
  }).join("\n");
}

/** 打开后若 GFM 没把单元格里的 **加粗** 解析成 mark，就补上，避免字面星号 */
export function findLiteralBoldInText(text: string): Array<{ from: number; to: number }> {
  const hits: Array<{ from: number; to: number }> = [];
  const re = /\*\*([^*]+)\*\*/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    hits.push({ from: match.index, to: match.index + match[0].length });
  }
  return hits;
}

export function applyLiteralBoldInTableCells(view: EditorView): boolean {
  const strong = view.state.schema.marks.strong;
  if (!strong) return false;
  const hits: Array<{ from: number; to: number }> = [];
  view.state.doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return;
    if (node.marks.some((mark) => mark.type === strong || mark.type.name === "code" || mark.type.name === "inlineCode")) {
      return;
    }
    const $pos = view.state.doc.resolve(pos);
    let inCell = false;
    for (let depth = $pos.depth; depth > 0; depth--) {
      const name = $pos.node(depth).type.name;
      if (name === "table_cell" || name === "table_header") {
        inCell = true;
        break;
      }
    }
    if (!inCell) return;
    for (const hit of findLiteralBoldInText(node.text)) {
      hits.push({ from: pos + hit.from, to: pos + hit.to });
    }
  });
  if (!hits.length) return false;
  let tr = view.state.tr;
  for (let i = hits.length - 1; i >= 0; i--) {
    const { from, to } = hits[i];
    const innerFrom = from + 2;
    const innerTo = to - 2;
    tr = tr.addMark(innerFrom, innerTo, strong.create());
    tr = tr.delete(innerTo, to);
    tr = tr.delete(from, from + 2);
  }
  view.dispatch(tr);
  return true;
}

/** 把单元格里的行分隔符换成 hardbreak，这样预览才是真换行 */
export function restoreLineSepBreaks(view: EditorView): boolean {
  const hb = view.state.schema.nodes.hardbreak;
  if (!hb) return false;
  const positions: number[] = [];
  view.state.doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return;
    const t = node.text;
    for (let i = 0; i < t.length; i++) {
      if (t[i] === CELL_BR_TOKEN) positions.push(pos + i);
    }
  });
  if (!positions.length) return false;
  let tr = view.state.tr;
  for (let i = positions.length - 1; i >= 0; i--) {
    const p = positions[i];
    tr = tr.replaceWith(p, p + 1, hb.create());
  }
  view.dispatch(tr);
  return true;
}
