/** 复制表格时写出钉钉/Word 认的像素列宽，避免贴出去变回等分。 */

import type { Node as PMNode } from "@milkdown/kit/prose/model";
import { NodeSelection, TextSelection } from "@milkdown/kit/prose/state";
import { CellSelection, TableMap } from "@milkdown/kit/prose/tables";
import type { EditorView } from "@milkdown/kit/prose/view";
import { serializeCellInlines } from "./table-breaks";
import { formatLayoutComment, isEqualCols, normalizeCols, parseLayoutComment, type MdTableLayout } from "./table-layout";

export interface CopiedTableLayout {
  cols: number[];
  widthPx?: number;
}

function resolveTableEl(dom: Node | null): HTMLTableElement | null {
  if (!dom || !(dom instanceof HTMLElement)) return null;
  if (dom.tagName === "TABLE") return dom as HTMLTableElement;
  const nested = dom.querySelector("table");
  return nested && !nested.closest(".drag-preview") ? nested : null;
}

function cellSel(sel: unknown): CellSelection | null {
  if (!sel || typeof sel !== "object") return null;
  if (sel instanceof CellSelection) return sel;
  const duck = sel as { $anchorCell?: { depth: number }; $headCell?: unknown };
  return duck.$anchorCell && duck.$headCell ? sel as CellSelection : null;
}

function cellSelectionCoversTable(sel: CellSelection): boolean {
  if (sel.isColSelection() && sel.isRowSelection()) return true;
  try {
    let table = null as ReturnType<typeof sel.$anchorCell.node> | null;
    for (let depth = sel.$anchorCell.depth; depth > 0; depth--) {
      if (sel.$anchorCell.node(depth).type.name === "table") {
        table = sel.$anchorCell.node(depth);
        break;
      }
    }
    if (!table) return false;
    const map = TableMap.get(table);
    let count = 0;
    sel.forEachCell(() => { count += 1; });
    return count > 0 && count === map.width * map.height;
  } catch {
    return false;
  }
}

const COPIED_LAYOUT_KEY = "smart-copied-table-layout";
let rememberedLayouts: MdTableLayout[] = [];

export function rememberCopiedTableLayouts(layouts: MdTableLayout[]) {
  rememberedLayouts = layouts.filter((layout) => layout.cols && layout.cols.length > 1 && !isEqualCols(layout.cols));
  try {
    sessionStorage.setItem(COPIED_LAYOUT_KEY, JSON.stringify(rememberedLayouts));
  } catch { /* 隐私模式可能写不了 */ }
}

export function recalledTableLayout(): MdTableLayout | undefined {
  if (rememberedLayouts[0]?.cols?.length) return rememberedLayouts[0];
  try {
    const raw = sessionStorage.getItem(COPIED_LAYOUT_KEY);
    const parsed = raw ? JSON.parse(raw) as MdTableLayout[] : [];
    return parsed[0]?.cols?.length ? parsed[0] : undefined;
  } catch {
    return undefined;
  }
}

function tablesFromDomSelection(root: HTMLElement): HTMLTableElement[] {
  const selected = Array.from(root.querySelectorAll("td.selectedCell, th.selectedCell, .selectedCell"));
  const byTable = new Map<HTMLTableElement, number>();
  selected.forEach((cell) => {
    const table = cell.closest("table");
    if (!table || table.closest(".drag-preview")) return;
    byTable.set(table, (byTable.get(table) || 0) + 1);
  });
  const full: HTMLTableElement[] = [];
  byTable.forEach((count, table) => {
    const total = table.querySelectorAll("th, td").length;
    if (total > 0 && count >= total) full.push(table);
  });
  if (full.length) return full;
  const node = root.querySelector(".ProseMirror-selectednode");
  if (!node) return [];
  const table = (node.tagName === "TABLE" ? node : node.querySelector("table")) as HTMLTableElement | null;
  return table && !table.closest(".drag-preview") ? [table] : [];
}

/** 选区里要带走列宽的表格（整表全选）。 */
export function tablesInSelection(view: EditorView, root?: HTMLElement): HTMLTableElement[] {
  const found: HTMLTableElement[] = [];
  const seen = new Set<HTMLTableElement>();
  const add = (table: HTMLTableElement | null) => {
    if (!table || seen.has(table) || table.closest(".drag-preview")) return;
    seen.add(table);
    found.push(table);
  };
  const sel = view.state.selection;
  const cells = cellSel(sel);
  if (cells && cellSelectionCoversTable(cells)) {
    const $cell = cells.$anchorCell;
    for (let depth = $cell.depth; depth > 0; depth--) {
      if ($cell.node(depth).type.name !== "table") continue;
      add(resolveTableEl(view.nodeDOM($cell.before(depth))));
      break;
    }
  }
  if (!found.length) {
    view.state.doc.nodesBetween(sel.from, sel.to, (node, pos) => {
      if (node.type.name === "table") add(resolveTableEl(view.nodeDOM(pos)));
    });
  }
  if (!found.length) {
    const $from = sel.$from;
    for (let depth = $from.depth; depth > 0; depth--) {
      if ($from.node(depth).type.name !== "table") continue;
      const pos = $from.before(depth);
      const size = $from.node(depth).nodeSize;
      if (sel.from <= pos + 1 && sel.to >= pos + size - 1) add(resolveTableEl(view.nodeDOM(pos)));
      break;
    }
  }
  if (!found.length && root) tablesFromDomSelection(root).forEach(add);
  return found;
}

export function countTables(view: EditorView): number {
  let n = 0;
  view.state.doc.descendants((node) => {
    if (node.type.name === "table") n += 1;
  });
  return n;
}

export function tableIndexAtSelection(view: EditorView): number | null {
  const { from } = view.state.selection;
  let index = -1;
  let hit: number | null = null;
  view.state.doc.descendants((node, pos) => {
    if (node.type.name !== "table") return;
    index += 1;
    if (from >= pos && from <= pos + node.nodeSize) hit = index;
  });
  return hit;
}

export function colWidthsFromTable(table: HTMLTableElement, layout?: MdTableLayout): CopiedTableLayout {
  const count = table.rows[0]?.cells.length || 0;
  const widthPx = Math.round(table.getBoundingClientRect().width || 0) || undefined;
  if (count <= 0) return { cols: [], widthPx };
  if (layout?.cols && layout.cols.length === count) {
    return { cols: normalizeCols(layout.cols, count), widthPx };
  }
  const span = table.getBoundingClientRect().width;
  if (span > 0 && table.rows[0]) {
    const measured = Array.from(table.rows[0].cells, (cell) => cell.getBoundingClientRect().width / span);
    if (measured.every((width) => width > 0)) return { cols: normalizeCols(measured, count), widthPx };
  }
  return { cols: normalizeCols(undefined, count), widthPx };
}

export function colsToPx(cols: number[], total: number): number[] {
  const n = cols.length;
  if (n === 0) return [];
  const floor = 24;
  const span = Math.max(total, floor * n);
  const px = cols.map((width) => Math.max(floor, Math.round(width * span)));
  px[n - 1] += span - px.reduce((sum, value) => sum + value, 0);
  if (px[n - 1] < floor) {
    const extra = floor - px[n - 1];
    px[n - 1] = floor;
    const rich = px.indexOf(Math.max(...px));
    if (rich >= 0 && rich !== n - 1) px[rich] = Math.max(floor, px[rich] - extra);
  }
  return px;
}

function cellInnerHtml(cell: HTMLTableCellElement): string {
  const clone = cell.cloneNode(true) as HTMLElement;
  clone.querySelectorAll(".ProseMirror-trailingBreak, .ProseMirror-separator").forEach((node) => node.remove());
  return clone.innerHTML;
}

/** 生成带像素列宽的独立 HTML 表，给钉钉文档用。 */
export function tableHtmlForExternalPaste(table: HTMLTableElement, layout: CopiedTableLayout): string {
  const count = table.rows[0]?.cells.length || 0;
  const cols = normalizeCols(layout.cols, count || layout.cols.length);
  if (!cols.length) return table.outerHTML;
  const total = layout.widthPx && layout.widthPx > 0 ? layout.widthPx : 600;
  const px = colsToPx(cols, total);
  const doc = table.ownerDocument;
  const out = doc.createElement("table");
  out.setAttribute("border", "1");
  out.setAttribute("cellspacing", "0");
  out.setAttribute("cellpadding", "0");
  out.setAttribute("width", String(total));
  out.setAttribute("style", `width:${total}px;border-collapse:collapse;table-layout:fixed`);
  const group = doc.createElement("colgroup");
  px.forEach((width) => {
    const col = doc.createElement("col");
    col.setAttribute("width", String(width));
    col.setAttribute("style", `width:${width}px`);
    group.appendChild(col);
  });
  out.appendChild(group);
  Array.from(table.rows).forEach((row) => {
    const tr = doc.createElement("tr");
    Array.from(row.cells).forEach((cell, index) => {
      const width = px[index] ?? px[px.length - 1] ?? total;
      const td = doc.createElement(cell.tagName.toLowerCase() === "th" ? "th" : "td");
      td.setAttribute("width", String(width));
      td.setAttribute("valign", "top");
      td.setAttribute("style", `width:${width}px;min-width:${width}px;max-width:${width}px;word-wrap:break-word;overflow-wrap:break-word`);
      td.innerHTML = cellInnerHtml(cell);
      tr.appendChild(td);
    });
    out.appendChild(tr);
  });
  return out.outerHTML;
}

function parseCssWidth(raw: string): number {
  const num = parseFloat(raw);
  return Number.isFinite(num) && num > 0 ? num : 0;
}

/** 从剪贴板 HTML 还原列宽：优先 smart-table 注释，否则读 col/td 的像素宽。 */
export function layoutFromClipboardHtml(html: string): MdTableLayout | undefined {
  if (!html) return undefined;
  const comment = html.match(/<!--\s*smart-table\b([^>]*)-->/i);
  if (comment) {
    const parsed = parseLayoutComment(`<!-- smart-table${comment[1]}-->`);
    if (parsed?.cols?.length) return { cols: normalizeCols(parsed.cols, parsed.cols.length), ...(parsed.rows ? { rows: parsed.rows } : {}) };
  }
  if (!html.includes("<table")) return undefined;
  const doc = new DOMParser().parseFromString(html, "text/html");
  const table = doc.querySelector("table");
  if (!table) return undefined;
  const read = (el: Element) => parseCssWidth(el.getAttribute("width") || "") || parseCssWidth((el as HTMLElement).style?.width || "");
  const cols = Array.from(table.querySelectorAll("col")).map(read);
  const fromHead = table.rows[0] ? Array.from(table.rows[0].cells).map(read) : [];
  const values = (cols.some((width) => width > 0) ? cols : fromHead).filter((width) => width > 0);
  if (values.length < 2) return undefined;
  const ratios = normalizeCols(values, values.length);
  if (isEqualCols(ratios)) return undefined;
  return { cols: ratios };
}

function tsvCell(text: string): string {
  const value = (text || "").replace(/\t/g, " ").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (/[\n"]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function tableToTsv(table: HTMLTableElement): string {
  return Array.from(table.rows)
    .map((row) => Array.from(row.cells).map((cell) => tsvCell(cell.innerText || "")).join("\t"))
    .join("\n");
}

function tableCellDepth($pos: { depth: number; node: (d: number) => { type: { name: string } } }): number | null {
  for (let d = $pos.depth; d > 0; d--) {
    const name = $pos.node(d).type.name;
    if (name === "table_cell" || name === "table_header") return d;
  }
  return null;
}

/** 选区里的 hardbreak 还原成真换行，不要交给 GFM 收成空格 */
export function rangeToPlainWithBreaks(doc: PMNode, from: number, to: number): string {
  if (from >= to) return "";
  const parts: string[] = [];
  doc.nodesBetween(from, to, (node, pos) => {
    if (node.type.name === "hardbreak" || node.type.name === "hard_break") {
      if (pos >= from && pos + node.nodeSize <= to) parts.push("\n");
      return false;
    }
    if (node.isText && node.text) {
      const start = Math.max(from, pos);
      const end = Math.min(to, pos + node.nodeSize);
      if (end > start) parts.push(node.text.slice(start - pos, end - pos));
      return false;
    }
    return true;
  });
  return parts.join("");
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** 单格台词的 HTML：只有 br，不包成一张表 */
export function cellPlainToClipboardHtml(text: string): string {
  const inner = escapeHtml(text).replace(/\n/g, "<br>");
  return `<html><head><meta charset="utf-8"></head><body><!--StartFragment-->${inner}<!--EndFragment--></body></html>`;
}

function writePlainClipboard(event: ClipboardEvent, text: string): boolean {
  const data = event.clipboardData;
  if (!data) return false;
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  try { data.clearData(); } catch { /* 部分浏览器不允许 clearData */ }
  data.setData("text/plain", text);
  data.setData("text/html", cellPlainToClipboardHtml(text));
  return true;
}

function countSelectedCells(sel: CellSelection): number {
  let n = 0;
  sel.forEachCell(() => { n += 1; });
  return n;
}

function firstSelectedCell(sel: CellSelection): PMNode | null {
  let found: PMNode | null = null;
  sel.forEachCell((node) => { if (!found) found = node; });
  return found;
}

/** 复制单格/格内文字：带换行的纯文本，不要 GFM 的 | 和 --- */
export function handleCellTextClipboard(
  event: ClipboardEvent,
  view: EditorView,
  opts?: { cut?: boolean },
): boolean {
  if (!event.clipboardData) return false;
  const sel = view.state.selection;
  const cells = cellSel(sel);
  if (cells) {
    if (cellSelectionCoversTable(cells) || countSelectedCells(cells) !== 1) return false;
    const node = firstSelectedCell(cells);
    if (!node) return false;
    const text = serializeCellInlines(node).replace(/\r\n/g, "\n");
    if (!writePlainClipboard(event, text)) return false;
    if (opts?.cut) view.dispatch(view.state.tr.deleteSelection());
    return true;
  }
  let depth: number | null = null;
  try { depth = tableCellDepth(sel.$from); } catch { return false; }
  if (depth == null) return false;
  if (sel instanceof NodeSelection) {
    const text = serializeCellInlines(sel.$from.node(depth)).replace(/\r\n/g, "\n");
    if (!writePlainClipboard(event, text)) return false;
    if (opts?.cut) view.dispatch(view.state.tr.deleteSelection());
    return true;
  }
  if (!(sel instanceof TextSelection)) return false;
  if (sel.empty) {
    if (opts?.cut) return false;
    const text = serializeCellInlines(sel.$from.node(depth)).replace(/\r\n/g, "\n");
    if (!text) return false;
    return writePlainClipboard(event, text);
  }
  const text = rangeToPlainWithBreaks(view.state.doc, sel.from, sel.to);
  if (!writePlainClipboard(event, text)) return false;
  if (opts?.cut) view.dispatch(view.state.tr.deleteSelection());
  return true;
}

/** 整表走列宽 HTML；单格走纯文本换行。 */
export function handleEditorClipboard(
  event: ClipboardEvent,
  view: EditorView,
  layouts: MdTableLayout[],
  root: HTMLElement,
  opts?: { cut?: boolean },
): boolean {
  if (handleTableClipboard(event, view, layouts, root, opts)) return true;
  return handleCellTextClipboard(event, view, opts);
}

function editorTables(root: HTMLElement): HTMLTableElement[] {
  return Array.from(root.querySelectorAll<HTMLTableElement>(".milkdown-table-block .table-wrapper > table"))
    .filter((table) => !table.closest(".drag-preview"));
}

/** 拦截复制：自己写剪贴板，不让 ProseMirror 后写把列宽盖掉。 */
export function handleTableClipboard(
  event: ClipboardEvent,
  view: EditorView,
  layouts: MdTableLayout[],
  root: HTMLElement,
  opts?: { cut?: boolean },
): boolean {
  const data = event.clipboardData;
  if (!data) return false;
  const selected = tablesInSelection(view, root);
  if (!selected.length) return false;
  const all = editorTables(root);
  const copied = selected.map((table) => {
    const index = all.indexOf(table);
    return colWidthsFromTable(table, index >= 0 ? layouts[index] : undefined);
  });
  rememberCopiedTableLayouts(copied.map((layout) => ({ cols: layout.cols })));
  const htmlParts = copied.map((layout, i) => {
    const comment = formatLayoutComment({ cols: layout.cols });
    return tableHtmlForExternalPaste(selected[i], layout) + (comment ? comment : "");
  });
  const html = `<html><head><meta charset="utf-8"></head><body><!--StartFragment-->${htmlParts.join("")}<!--EndFragment--></body></html>`;
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  try { data.clearData(); } catch { /* 部分浏览器不允许 clearData */ }
  data.setData("text/html", html);
  data.setData("text/plain", selected.map(tableToTsv).join("\n\n"));
  if (opts?.cut) view.dispatch(view.state.tr.deleteSelection());
  return true;
}
