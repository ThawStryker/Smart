/** 给 Milkdown 表格叠一层拖动手柄：列宽比例、行最小高度。
 * 手柄和样式都放在纸面 overlay 里，避免写进 Crepe 会清掉的 table-wrapper。 */

import {
  clampRowHeight,
  MD_ROW_MIN,
  normalizeCols,
  normalizeRows,
  resizeCols,
  type MdTableLayout,
} from "./table-layout";

export interface MdTableResizeApi {
  sync: () => void;
  destroy: () => void;
  dragging: () => boolean;
}

function tablesIn(root: HTMLElement): HTMLTableElement[] {
  return Array.from(root.querySelectorAll<HTMLTableElement>(".milkdown-table-block .table-wrapper > table"))
    .filter((table) => !table.closest(".drag-preview"));
}

function blockOf(table: HTMLTableElement): HTMLElement | null {
  return table.closest(".milkdown-table-block");
}

function overlayHost(root: HTMLElement): HTMLElement {
  return (root.closest(".work-editor-paper") as HTMLElement | null) || root;
}

function ensureOverlay(host: HTMLElement): HTMLElement {
  let overlay = host.querySelector(":scope > .work-md-table-overlay") as HTMLElement | null;
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.className = "work-md-table-overlay";
    host.appendChild(overlay);
  }
  return overlay;
}

function ensureSheet(overlay: HTMLElement): HTMLStyleElement {
  let sheet = overlay.querySelector(":scope > style") as HTMLStyleElement | null;
  if (!sheet) {
    sheet = document.createElement("style");
    overlay.insertBefore(sheet, overlay.firstChild);
  }
  return sheet;
}

function layoutCss(index: number, cols: number[], rows: number[]): string {
  const sel = `.milkdown-table-block[data-md-table="${index}"] table.children`;
  const colRules = cols.map((width, col) =>
    `${sel} tr:first-child > :nth-child(${col + 1}){width:${(width * 100).toFixed(4)}%}`,
  );
  const rowRules = rows.flatMap((height, row) => (
    height > 0
      ? [`${sel} tr:nth-child(${row + 1}){height:${height}px}`]
      : []
  ));
  return [...colRules, ...rowRules].join("");
}

function applyLayouts(tables: HTMLTableElement[], layouts: MdTableLayout[], sheet: HTMLStyleElement) {
  const css = tables.map((table, index) => {
    const block = blockOf(table);
    if (block) block.dataset.mdTable = String(index);
    const colCount = table.rows[0]?.cells.length || 0;
    const cols = normalizeCols(layouts[index]?.cols, colCount);
    const rows = normalizeRows(layouts[index]?.rows, table.rows.length);
    return layoutCss(index, cols, rows);
  }).join("");
  // 同样的 CSS 再写一遍会让整表重算样式，六点选中时看起来闪一下
  if (sheet.textContent === css) return;
  sheet.textContent = css;
}

function paintHandles(overlay: HTMLElement, host: HTMLElement, tables: HTMLTableElement[]) {
  overlay.querySelectorAll(".work-md-col-resize, .work-md-row-resize").forEach((node) => node.remove());
  const hostBox = host.getBoundingClientRect();
  tables.forEach((table, index) => {
    const tableBox = table.getBoundingClientRect();
    if (!tableBox.width || !tableBox.height) return;
    const first = table.rows[0];
    if (!first) return;
    Array.from(first.cells).slice(0, -1).forEach((cell, col) => {
      const handle = document.createElement("div");
      handle.className = "work-md-col-resize";
      handle.contentEditable = "false";
      handle.dataset.kind = "col";
      handle.dataset.table = String(index);
      handle.dataset.index = String(col);
      handle.title = "拖动调整列宽";
      const box = cell.getBoundingClientRect();
      handle.style.left = `${box.right - hostBox.left}px`;
      handle.style.top = `${tableBox.top - hostBox.top}px`;
      handle.style.height = `${tableBox.height}px`;
      overlay.appendChild(handle);
    });
    Array.from(table.rows).forEach((row, rowIndex) => {
      const handle = document.createElement("div");
      handle.className = "work-md-row-resize";
      handle.contentEditable = "false";
      handle.dataset.kind = "row";
      handle.dataset.table = String(index);
      handle.dataset.index = String(rowIndex);
      handle.title = "拖动调整行高";
      const box = row.getBoundingClientRect();
      handle.style.left = `${tableBox.left - hostBox.left}px`;
      handle.style.top = `${box.bottom - hostBox.top}px`;
      handle.style.width = `${tableBox.width}px`;
      overlay.appendChild(handle);
    });
  });
}

export function attachMdTableResize(
  root: HTMLElement,
  opts: {
    getLayouts: () => MdTableLayout[];
    setLayouts: (next: MdTableLayout[]) => void;
    onCommit: () => void;
    busy?: () => boolean;
  },
): MdTableResizeApi {
  let dragging = false;
  let active: HTMLElement | null = null;
  let lastPaint = "";
  const host = overlayHost(root);
  const overlay = ensureOverlay(host);
  const sheet = ensureSheet(overlay);

  const sync = () => {
    if (dragging) return;
    const layouts = opts.getLayouts();
    const tables = tablesIn(root);
    root.dataset.mdTableCount = String(tables.length);
    overlay.dataset.mdHandleReady = String(tables.length);
    applyLayouts(tables, layouts, sheet);
    const paintKey = tables.map((table, index) => {
      const box = table.getBoundingClientRect();
      return `${index}:${table.rows.length}x${table.rows[0]?.cells.length || 0}:${Math.round(box.left)}:${Math.round(box.top)}:${Math.round(box.width)}:${Math.round(box.height)}`;
    }).join("|");
    if (paintKey === lastPaint) return;
    lastPaint = paintKey;
    paintHandles(overlay, host, tables);
  };

  const startCol = (table: HTMLTableElement, tableIndex: number, index: number, startX: number, handle: HTMLElement) => {
    const colCount = table.rows[0]?.cells.length || 0;
    const layouts = opts.getLayouts().slice();
    const current = { ...(layouts[tableIndex] || {}) };
    const start = normalizeCols(current.cols, colCount);
    const span = table.getBoundingClientRect().width || 1;
    const block = blockOf(table);
    block?.classList.add("is-resizing");
    handle.classList.add("is-active");
    dragging = true;
    active = handle;
    const move = (ev: PointerEvent) => {
      current.cols = resizeCols(start, index, (ev.clientX - startX) / span);
      layouts[tableIndex] = current;
      opts.setLayouts(layouts);
      applyLayouts(tablesIn(root), layouts, sheet);
      const cell = table.rows[0]?.cells[index];
      if (cell) {
        handle.style.left = `${cell.getBoundingClientRect().right - host.getBoundingClientRect().left}px`;
      }
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      dragging = false;
      active = null;
      handle.classList.remove("is-active");
      block?.classList.remove("is-resizing");
      opts.onCommit();
      sync();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const startRow = (table: HTMLTableElement, tableIndex: number, index: number, startY: number, handle: HTMLElement) => {
    const row = table.rows[index];
    if (!row) return;
    const layouts = opts.getLayouts().slice();
    const current = { ...(layouts[tableIndex] || {}) };
    const rows = normalizeRows(current.rows, table.rows.length);
    const startH = Math.max(MD_ROW_MIN, row.getBoundingClientRect().height);
    const block = blockOf(table);
    block?.classList.add("is-resizing");
    handle.classList.add("is-active");
    dragging = true;
    active = handle;
    const move = (ev: PointerEvent) => {
      rows[index] = clampRowHeight(startH + (ev.clientY - startY));
      current.rows = rows.slice();
      layouts[tableIndex] = current;
      opts.setLayouts(layouts);
      applyLayouts(tablesIn(root), layouts, sheet);
      handle.style.top = `${row.getBoundingClientRect().bottom - host.getBoundingClientRect().top}px`;
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      dragging = false;
      active = null;
      handle.classList.remove("is-active");
      block?.classList.remove("is-resizing");
      opts.onCommit();
      sync();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const onDown = (event: PointerEvent) => {
    if (opts.busy?.()) return;
    const handle = (event.target as HTMLElement | null)?.closest(".work-md-col-resize, .work-md-row-resize") as HTMLElement | null;
    if (!handle || !overlay.contains(handle)) return;
    const tables = tablesIn(root);
    const table = tables[Number(handle.dataset.table || "0")];
    if (!table) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    const index = Number(handle.dataset.index || "0");
    const tableIndex = Number(handle.dataset.table || "0");
    if (handle.dataset.kind === "col") startCol(table, tableIndex, index, event.clientX, handle);
    else startRow(table, tableIndex, index, event.clientY, handle);
  };

  root.dataset.mdResize = "1";
  overlay.addEventListener("pointerdown", onDown, true);
  let timer = 0;
  const observer = new MutationObserver(() => {
    if (dragging) return;
    window.clearTimeout(timer);
    timer = window.setTimeout(sync, 40);
  });
  observer.observe(root, { childList: true, subtree: true });
  window.setTimeout(sync, 0);
  window.setTimeout(sync, 200);
  return {
    sync,
    dragging: () => dragging || Boolean(active),
    destroy: () => {
      observer.disconnect();
      window.clearTimeout(timer);
      overlay.removeEventListener("pointerdown", onDown, true);
      overlay.remove();
    },
  };
}
