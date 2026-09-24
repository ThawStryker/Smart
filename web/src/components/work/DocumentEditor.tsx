import { useEffect, useRef, useState } from "react";
import { Crepe } from "@milkdown/crepe";
import { editorViewCtx, editorViewOptionsCtx, parserCtx } from "@milkdown/kit/core";
import { Fragment, Slice, type Schema } from "@milkdown/kit/prose/model";
import { NodeSelection, Selection, TextSelection } from "@milkdown/kit/prose/state";
import { CellSelection, TableMap } from "@milkdown/kit/prose/tables";
import type { EditorView } from "@milkdown/kit/prose/view";
import { replaceAll, getMarkdown } from "@milkdown/utils";
import { clipboardTextWithBreaks, matrixToGfm, tableMatrixFromClipboard } from "@/lib/paste-table";
import { brToLineSepInTables, persistTableCellBreaks, restoreLineSepBreaks, applyLiteralBoldInTableCells } from "@/lib/table-breaks";
import "@milkdown/crepe/theme/common/style.css";
import "@milkdown/crepe/theme/nord.css";
import "./editor.css";

/** 选区已在视口内或节点高于视口时不要滚；否则只做 nearest，避免整表顶对齐 */
function scrollSelectionNearest(view: EditorView): boolean {
  const scroller = view.dom.closest(".overflow-auto") as HTMLElement | null;
  if (!scroller) return true;
  let top = 0;
  let bottom = 0;
  try {
    const coords = view.coordsAtPos(view.state.selection.head);
    top = coords.top;
    bottom = coords.bottom;
  } catch {
    return true;
  }
  const bound = scroller.getBoundingClientRect();
  const margin = 8;
  const visible = bottom > bound.top + margin && top < bound.bottom - margin;
  if (visible) return true;
  if (top < bound.top + margin) scroller.scrollTop -= bound.top + margin - top;
  else if (bottom > bound.bottom - margin) scroller.scrollTop += bottom - (bound.bottom - margin);
  return true;
}

function isBlockDragHandle(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  const handle = el?.closest(".milkdown-block-handle");
  if (!handle) return false;
  const items = handle.querySelectorAll(".operation-item");
  const item = el?.closest(".operation-item");
  return Boolean(item && items[1] && item === items[1]);
}

function isInsideTable($pos: { depth: number; node: (d: number) => { type: { name: string } } }) {
  for (let d = $pos.depth; d > 0; d--) {
    if ($pos.node(d).type.name === "table") return true;
  }
  return false;
}

function tableCellDepth($pos: { depth: number; node: (d: number) => { type: { name: string } } }): number | null {
  for (let d = $pos.depth; d > 0; d--) {
    const name = $pos.node(d).type.name;
    if (name === "table_cell" || name === "table_header") return d;
  }
  return null;
}

function isTableUiChrome(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  if (!el) return true;
  return Boolean(el.closest(
    "a, button, .milkdown-table-block .handle, .cell-handle, .milkdown-icon, .milkdown-toolbar, .milkdown-slash-menu, .milkdown-block-handle",
  ));
}

/** 从点到的 td/th 反查该格内容区间，避免 posAtCoords 在格缝跳到隔壁 */
function cellContentRange(view: EditorView, td: HTMLElement): { from: number; to: number } | null {
  try {
    let pos = view.posAtDOM(td, 0);
    if (pos < 0) return null;
    let $pos = view.state.doc.resolve(pos);
    let depth = tableCellDepth($pos);
    if (depth == null) {
      pos = Math.min(pos + 1, view.state.doc.content.size);
      $pos = view.state.doc.resolve(pos);
      depth = tableCellDepth($pos);
    }
    if (depth == null) return null;
    return { from: $pos.start(depth), to: $pos.end(depth) };
  } catch {
    return null;
  }
}

function coordsLeaveClickedCell(
  view: EditorView,
  coords: { pos: number; inside: number } | null,
  range: { from: number; to: number },
): boolean {
  if (!coords) return true;
  if (coords.pos < range.from || coords.pos > range.to) return true;
  if (coords.inside < 0) return true;
  try {
    const $inside = view.state.doc.resolve(coords.inside);
    const depth = tableCellDepth($inside);
    return depth == null || $inside.start(depth) !== range.from;
  } catch {
    return true;
  }
}

function selectionInClickedCell(
  view: EditorView,
  at: number,
  range: { from: number; to: number },
  bias: number,
): Selection | null {
  const tryNear = (pos: number, b: number) => {
    try {
      const sel = TextSelection.near(view.state.doc.resolve(pos), b);
      if (sel.head >= range.from && sel.head <= range.to) return sel;
    } catch { /* 格边界可能不是合法插入点 */ }
    return null;
  };
  const clamped = Math.max(range.from, Math.min(range.to, at));
  return tryNear(clamped, bias) || tryNear(clamped, -bias) || tryNear(range.to, -1) || tryNear(range.from, 1);
}

function persistedMarkdownFrom(crepe: Crepe): string {
  const md = crepe.editor.action(getMarkdown()) || "";
  try {
    return persistTableCellBreaks(md, crepe.editor.ctx.get(editorViewCtx).state.doc);
  } catch {
    return md;
  }
}

function loadMarkdownInto(crepe: Crepe, md: string) {
  crepe.editor.action(replaceAll(brToLineSepInTables(md || "")));
  try {
    restoreLineSepBreaks(crepe.editor.ctx.get(editorViewCtx));
  } catch { /* 视图未就绪 */ }
}

let lastTableCaret: { pos: number; from: number; to: number } | null = null;

/** 单击格子：光标必须留在点到的那一格，不能先闪到隔壁再跳回来 */
function placeCaretInTableCell(view: EditorView, event: MouseEvent): boolean {
  if (event.button !== 0 || event.detail >= 2) return false;
  if (event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) return false;
  if (isTableUiChrome(event.target)) return false;
  const td = (event.target as HTMLElement | null)?.closest("td, th") as HTMLElement | null;
  if (!td) return false;
  const range = cellContentRange(view, td);
  if (!range) return false;
  const coords = view.posAtCoords({ left: event.clientX, top: event.clientY });
  const rect = td.getBoundingClientRect();
  const bias = event.clientX < (rect.left + rect.right) / 2 ? 1 : -1;
  const jumped = coordsLeaveClickedCell(view, coords, range);
  const sel = selectionInClickedCell(view, jumped ? (bias < 0 ? range.to : range.from) : (coords?.pos ?? range.to), range, bias);
  if (!sel) return false;
  lastTableCaret = { pos: sel.head, from: range.from, to: range.to };
  view.focus();
  if (!view.state.selection.eq(sel)) {
    view.dispatch(view.state.tr.setSelection(sel));
  }
  if (jumped) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  }
  return true;
}

/** Milkdown 仍可能 rAF 把格子收成段落 NodeSelection；拉回点到的那一格 */
function collapseTableCellNodeSelection(view: EditorView): void {
  const last = lastTableCaret;
  const { selection } = view.state;
  if (last) {
    const inCell = !(selection instanceof NodeSelection)
      && selection.from >= last.from
      && selection.to <= last.to;
    if (inCell) return;
    const restored = selectionInClickedCell(view, last.pos, last, 1);
    if (restored && !selection.eq(restored)) {
      view.dispatch(view.state.tr.setSelection(restored));
    }
    return;
  }
  if (!(selection instanceof NodeSelection)) return;
  if (selection.node.type.name === "table") return;
  if (tableCellDepth(selection.$from) == null) return;
  view.dispatch(view.state.tr.setSelection(TextSelection.near(selection.$from, 1)));
}

/** 双击格子：选中该格全部文字（不是 CellSelection） */
function selectAllInTableCell(view: EditorView, pos: number, event: MouseEvent): boolean {
  if (event.button !== 0) return false;
  if (isTableUiChrome(event.target)) return false;
  try {
    const $pos = view.state.doc.resolve(pos);
    const depth = tableCellDepth($pos);
    if (depth == null) return false;
    const from = $pos.start(depth);
    const to = $pos.end(depth);
    if (to <= from) return false;
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, from, to)));
    return true;
  } catch {
    return false;
  }
}

/** 格内回车插入换行（hardbreak → br），不要执行 Milkdown 的退出表格 */
function insertLineBreakInTableCell(view: EditorView): boolean {
  const { state } = view;
  const { selection } = state;
  if (!(selection instanceof TextSelection)) return false;
  if (tableCellDepth(selection.$from) == null) return false;
  const type = state.schema.nodes.hardbreak;
  if (!type) return false;
  view.dispatch(state.tr.replaceSelectionWith(type.create()).scrollIntoView());
  return true;
}

function handleEditorKeyDown(view: EditorView, event: KeyboardEvent): boolean {
  if (event.key !== "Enter" || event.metaKey || event.ctrlKey || event.altKey) return false;
  return insertLineBreakInTableCell(view);
}

/** 点在表格文字上时直接落插入点，避免先 NodeSelection 整表再改回来（格子外框会闪一下） */
function handleEditorClick(view: EditorView, pos: number, event: MouseEvent): boolean {
  if (event.button !== 0 || event.detail >= 2) return false;
  if (isBlockDragHandle(event.target) || isTableUiChrome(event.target)) return false;
  if ((event.target as HTMLElement | null)?.closest("td, th")) {
    return placeCaretInTableCell(view, event);
  }
  try {
    const $pos = view.state.doc.resolve(pos);
    if (!isInsideTable($pos) && !$pos.parent.inlineContent && !$pos.parent.isTextblock) {
      return false;
    }
    const name = $pos.parent.type.name;
    if (name === "image" || name === "image-block") return false;
    view.dispatch(view.state.tr.setSelection(TextSelection.near($pos)));
    return true;
  } catch {
    return false;
  }
}

/** 格子文本按换行拆成 text + hardbreak，单元格只允许一个 paragraph */
function inlineFromCellText(schema: Schema, text: string) {
  const hb = schema.nodes.hardbreak;
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const nodes = [];
  for (let i = 0; i < lines.length; i++) {
    if (i > 0 && hb) nodes.push(hb.create());
    if (lines[i]) nodes.push(schema.text(lines[i]));
  }
  return nodes;
}

function paragraphFromCellText(schema: Schema, text: string) {
  const inline = inlineFromCellText(schema, text);
  if (!inline.length) return schema.nodes.paragraph.createAndFill()!;
  return schema.nodes.paragraph.create(null, inline);
}

function tableNodeFromMatrix(schema: Schema, matrix: string[][]) {
  try {
    const headerRowType = schema.nodes.table_header_row;
    const rowType = schema.nodes.table_row;
    const headerType = schema.nodes.table_header;
    const cellType = schema.nodes.table_cell;
    const tableType = schema.nodes.table;
    if (!headerRowType || !rowType || !headerType || !cellType || !tableType) return null;
    if (matrix.length < 1 || matrix[0].length < 2) return null;
    const cols = matrix[0].length;
    const headerRow = headerRowType.create(
      null,
      matrix[0].map((text) => headerType.create({ alignment: "left" }, paragraphFromCellText(schema, text))),
    );
    const body = (matrix.length > 1 ? matrix.slice(1) : [Array.from({ length: cols }, () => "")]).map((row) =>
      rowType.create(
        null,
        row.map((text) => cellType.create({ alignment: "left" }, paragraphFromCellText(schema, text))),
      ),
    );
    if (!headerRow || body.some((r) => !r)) return null;
    return tableType.create(null, [headerRow, ...body]);
  } catch {
    return null;
  }
}

function insertTableFromMatrix(view: EditorView, matrix: string[][]): boolean {
  const node = tableNodeFromMatrix(view.state.schema, matrix);
  if (!node) return false;
  const slice = new Slice(Fragment.from(node), 0, 0);
  const { selection } = view.state;
  for (let d = selection.$from.depth; d > 0; d--) {
    if (selection.$from.node(d).type.name === "table") {
      const from = selection.$from.before(d);
      const to = from + selection.$from.node(d).nodeSize;
      view.dispatch(view.state.tr.replace(from, to, slice).scrollIntoView());
      return true;
    }
  }
  view.dispatch(view.state.tr.replaceSelection(slice).scrollIntoView());
  return true;
}

function insertTextWithHardbreaks(view: EditorView, text: string): boolean {
  if (tableCellDepth(view.state.selection.$from) == null) return false;
  if (!text.includes("\n")) return false;
  const nodes = inlineFromCellText(view.state.schema, text);
  if (!nodes.length) return false;
  try {
    view.dispatch(view.state.tr.replaceSelection(new Slice(Fragment.from(nodes), 0, 0)).scrollIntoView());
    return true;
  } catch {
    return false;
  }
}

/** 粘贴表格：先走 GFM 解析（保留 ** 和换行），失败再插入纯文本表 */
function insertMarkdownTable(crepe: Crepe, md: string): boolean {
  try {
    let ok = false;
    crepe.editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      const parser = ctx.get(parserCtx);
      const doc = parser(brToLineSepInTables(md || ""));
      if (!doc || !doc.content.childCount) return;
      const slice = new Slice(doc.content, 0, 0);
      const { selection } = view.state;
      for (let d = selection.$from.depth; d > 0; d--) {
        if (selection.$from.node(d).type.name === "table") {
          const from = selection.$from.before(d);
          const to = from + selection.$from.node(d).nodeSize;
          view.dispatch(view.state.tr.replace(from, to, slice).scrollIntoView());
          restoreLineSepBreaks(view);
          applyLiteralBoldInTableCells(view);
          ok = true;
          return;
        }
      }
      view.dispatch(view.state.tr.replaceSelection(slice).scrollIntoView());
      restoreLineSepBreaks(view);
      applyLiteralBoldInTableCells(view);
      ok = true;
    });
    return ok;
  } catch {
    return false;
  }
}

function pasteClipboardTable(view: EditorView, crepe: Crepe, data: DataTransfer | null): boolean {
  const matrix = tableMatrixFromClipboard(data);
  if (!matrix) return false;
  const gfm = matrixToGfm(matrix);
  if (gfm && insertMarkdownTable(crepe, gfm)) return true;
  return insertTableFromMatrix(view, matrix);
}

/** 单击六点手柄后：整表改成单元格全选，其它块选中内部文本，避免 NodeSelection 藏掉划选 */
function selectHandleBlock(view: EditorView) {
  const { selection, doc } = view.state;
  if (!(selection instanceof NodeSelection)) return;

  if (selection.node.type.name === "table") {
    try {
      const map = TableMap.get(selection.node);
      const cells = map.cellsInRect({ left: 0, right: map.width, top: 0, bottom: map.height });
      if (!cells.length) return;
      const start = selection.from + 1;
      view.dispatch(
        view.state.tr.setSelection(
          CellSelection.create(doc, start + cells[0], start + cells[cells.length - 1]),
        ),
      );
    } catch { /* 表结构异常时保持原选区 */ }
    return;
  }

  if (selection.node.isLeaf) return;
  const from = selection.from + 1;
  const to = selection.to - 1;
  if (to <= from) return;
  try {
    view.dispatch(view.state.tr.setSelection(TextSelection.create(doc, from, to)));
  } catch { /* 无法划选内部时保持 NodeSelection */ }
}

export interface DocumentEditorProps {
  content: string;
  filePath: string | null;
  isStreaming: boolean;
  onSave: (path: string, content: string) => void;
  onContentChange: (content: string, path?: string) => void;
  onClose?: () => void;
}

export function DocumentEditor({
  content, filePath, isStreaming, onSave, onContentChange, onClose,
}: DocumentEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const crepeRef = useRef<Crepe | null>(null);
  const isInternalChangeRef = useRef(false);
  const lastEditorMdRef = useRef(content);
  const sourceRef = useRef<HTMLTextAreaElement>(null);
  const [sourceView, setSourceView] = useState(false);
  const [sourceMd, setSourceMd] = useState("");
  const [ready, setReady] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const savedTimerRef = useRef<number | null>(null);

  const onSaveRef = useRef(onSave); onSaveRef.current = onSave;
  const onContentChangeRef = useRef(onContentChange); onContentChangeRef.current = onContentChange;
  const filePathRef = useRef(filePath); filePathRef.current = filePath;
  const contentRef = useRef(content); contentRef.current = content;
  const isStreamingRef = useRef(isStreaming); isStreamingRef.current = isStreaming;
  const prevPathRef = useRef<string | null>(null);
  const hydratingRef = useRef(false);
  const hydrateTimerRef = useRef<number | null>(null);
  const sourceViewRef = useRef(sourceView);
  sourceViewRef.current = sourceView;
  const sourceMdRef = useRef(sourceMd);
  sourceMdRef.current = sourceMd;

  const beginHydrate = () => {
    hydratingRef.current = true;
    if (hydrateTimerRef.current) window.clearTimeout(hydrateTimerRef.current);
    hydrateTimerRef.current = window.setTimeout(() => {
      hydratingRef.current = false;
      hydrateTimerRef.current = null;
    }, 350);
  };

  const commitFromEditor = (crepe?: Crepe | null) => {
    if (hydratingRef.current || isStreamingRef.current) return;
    const fp = filePathRef.current;
    if (!fp) return;
    let md = "";
    try {
      if (sourceViewRef.current) {
        md = sourceRef.current?.value ?? sourceMdRef.current;
      } else {
        const editor = crepe ?? crepeRef.current;
        if (!editor) return;
        md = persistedMarkdownFrom(editor);
      }
    } catch {
      return;
    }
    if (md === lastEditorMdRef.current) return;
    lastEditorMdRef.current = md;
    isInternalChangeRef.current = true;
    onContentChangeRef.current(md, fp);
    onSaveRef.current(fp, md);
    setShowSaved(true);
    if (savedTimerRef.current) window.clearTimeout(savedTimerRef.current);
    savedTimerRef.current = window.setTimeout(() => setShowSaved(false), 2000);
  };

  const flushEditor = (crepe?: Crepe | null, pathOverride?: string | null, persistOnly = false) => {
    hydratingRef.current = false;
    const fp = pathOverride ?? filePathRef.current;
    if (!fp) return;
    try {
      let md = "";
      if (sourceViewRef.current) {
        md = sourceRef.current?.value ?? sourceMdRef.current;
      } else {
        const editor = crepe ?? crepeRef.current;
        if (!editor) return;
        md = persistedMarkdownFrom(editor);
      }
      lastEditorMdRef.current = md;
      isInternalChangeRef.current = true;
      onSaveRef.current(fp, md);
      // 卸载/切文件只回写旧路径，不要改当前打开的那份
      if (!persistOnly) onContentChangeRef.current(md, fp);
    } catch { /* 销毁中 */ }
  };

  useEffect(() => () => {
    if (savedTimerRef.current) window.clearTimeout(savedTimerRef.current);
  }, []);

  // Init Crepe once on mount, save before switching files
  useEffect(() => {
    if (!containerRef.current) return;
    const crepe = new Crepe({
      root: containerRef.current,
      defaultValue: brToLineSepInTables(content || ""),
      // 虚拟光标会关掉原生 caret，颜色又用边框米色，预览里几乎看不见插入点
      featureConfigs: {
        [Crepe.Feature.Cursor]: { virtual: false },
      },
    });
    crepe.editor.config((ctx) => {
      ctx.update(editorViewOptionsCtx, (prev) => ({
        ...prev,
        handleScrollToSelection: scrollSelectionNearest,
        handleKeyDown: (view, event) => {
          if (handleEditorKeyDown(view, event as KeyboardEvent)) return true;
          return prev.handleKeyDown?.(view, event) ?? false;
        },
        handlePaste: (view, event, slice) => {
          if ((event as ClipboardEvent).defaultPrevented) return true;
          const data = (event as ClipboardEvent).clipboardData;
          if (pasteClipboardTable(view, crepe, data)) return true;
          if (insertTextWithHardbreaks(view, clipboardTextWithBreaks(data))) return true;
          return prev.handlePaste?.(view, event, slice) ?? false;
        },
        handleClick: (view, pos, event) => {
          if (handleEditorClick(view, pos, event as MouseEvent)) return true;
          return prev.handleClick?.(view, pos, event) ?? false;
        },
        handleDoubleClick: (view, pos, event) => {
          if (selectAllInTableCell(view, pos, event as MouseEvent)) return true;
          return prev.handleDoubleClick?.(view, pos, event) ?? false;
        },
      }));
    });
    crepe.create().then(() => {
      crepeRef.current = crepe;
      try {
        const latest = contentRef.current || "";
        beginHydrate();
        loadMarkdownInto(crepe, latest);
        lastEditorMdRef.current = latest;
        const view = crepe.editor.ctx.get(editorViewCtx);
        const focus = view.dom.focus.bind(view.dom);
        view.dom.focus = (opts?: FocusOptions) => focus({ preventScroll: true, ...opts });
      } catch { /* 视图未就绪 */ }
      crepe.on((listener) => {
        const persistNow = () => commitFromEditor(crepe);
        listener.updated(persistNow);
        listener.markdownUpdated(persistNow);
        listener.blur(persistNow);
      });
      setReady(true);
    });
    const root = containerRef.current;
    let dragged = false;
    const onDown = (e: Event) => {
      if (!isBlockDragHandle(e.target)) return;
      dragged = false;
    };
    const onDragStart = () => { dragged = true; };
    const onUp = (e: Event) => {
      if (dragged || !isBlockDragHandle(e.target)) return;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const view = crepeRef.current?.editor.ctx.get(editorViewCtx);
          if (view) selectHandleBlock(view);
        });
      });
    };
    const onPaperDown = (e: Event) => {
      const t = e.target as HTMLElement | null;
      if (!t) return;
      if (t.closest(".ProseMirror, .milkdown-block-handle, .milkdown-toolbar, .milkdown-slash-menu, .handle")) return;
      const view = crepeRef.current?.editor.ctx.get(editorViewCtx);
      view?.focus();
    };
    const editorView = () => {
      try { return crepeRef.current?.editor.ctx.get(editorViewCtx); } catch { return undefined; }
    };
    const onTableCellDown = (e: Event) => {
      const view = editorView();
      if (view) placeCaretInTableCell(view, e as MouseEvent);
    };
    const onTableCellUp = (e: Event) => {
      const el = e.target as HTMLElement | null;
      if (!el?.closest("td, th") || isTableUiChrome(e.target)) return;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const view = editorView();
          if (view) collapseTableCellNodeSelection(view);
        });
      });
    };
    const onPaste = (e: Event) => {
      if (!crepeRef.current) return;
      const ev = e as ClipboardEvent;
      const t = ev.target as HTMLElement | null;
      if (!t?.closest(".ProseMirror")) return;
      const view = editorView();
      if (!view) return;
      if (pasteClipboardTable(view, crepeRef.current, ev.clipboardData)) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (insertTextWithHardbreaks(view, clipboardTextWithBreaks(ev.clipboardData))) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    root.addEventListener("pointerdown", onDown, true);
    root.addEventListener("pointerdown", onTableCellDown, true);
    root.addEventListener("mousedown", onTableCellDown, true);
    root.addEventListener("pointerdown", onPaperDown);
    root.addEventListener("dragstart", onDragStart, true);
    root.addEventListener("pointerup", onUp, true);
    root.addEventListener("pointerup", onTableCellUp, true);
    root.addEventListener("paste", onPaste, true);
    const mountedPath = filePath;
    const onPageHide = () => flushEditor(crepe, mountedPath, true);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      if (hydrateTimerRef.current) window.clearTimeout(hydrateTimerRef.current);
      flushEditor(crepe, mountedPath, true);
      root.removeEventListener("pointerdown", onDown, true);
      root.removeEventListener("pointerdown", onTableCellDown, true);
      root.removeEventListener("mousedown", onTableCellDown, true);
      root.removeEventListener("pointerdown", onPaperDown);
      root.removeEventListener("dragstart", onDragStart, true);
      root.removeEventListener("pointerup", onUp, true);
      root.removeEventListener("pointerup", onTableCellUp, true);
      root.removeEventListener("paste", onPaste, true);
      try { crepe.destroy(); } catch {}
      crepeRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 同实例切路径时只回写旧文件（正常切文件靠 key remount）
  useEffect(() => {
    const prev = prevPathRef.current;
    if (ready && crepeRef.current && prev && prev !== filePath) {
      flushEditor(crepeRef.current, prev, true);
    }
    prevPathRef.current = filePath;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filePath]);

  // 外部 content 变化时同步进编辑器（含 agent 流式写入）
  // 流式期间以 props.content 为准，避免空文档 markdownUpdated 把正文冲掉
  useEffect(() => {
    if (!ready || !crepeRef.current || !filePath) return;
    if (hydratingRef.current) return;
    if (content === lastEditorMdRef.current) {
      isInternalChangeRef.current = false;
      return;
    }
    if (!isStreaming && isInternalChangeRef.current) {
      isInternalChangeRef.current = false;
      return;
    }
    isInternalChangeRef.current = false;
    lastEditorMdRef.current = content;
    beginHydrate();
    loadMarkdownInto(crepeRef.current, content || "");
  }, [content, isStreaming, ready, filePath]);

  // Toggle preview <-> source
  const toggleSource = () => {
    if (!sourceView) {
      let md = "";
      try {
        md = crepeRef.current ? persistedMarkdownFrom(crepeRef.current) : "";
      } catch { /* 编辑器未就绪时用已保存的 markdown */ }
      setSourceMd(md || lastEditorMdRef.current || content || "");
      setSourceView(true);
    } else {
      const md = sourceRef.current?.value ?? sourceMd;
      if (crepeRef.current) {
        lastEditorMdRef.current = md;
        isInternalChangeRef.current = true;
        beginHydrate();
        loadMarkdownInto(crepeRef.current, md);
        onContentChange(md, filePath ?? undefined);
        if (filePath) onSave(filePath, md);
      }
      setSourceView(false);
    }
  };

  const handleSourceEdit = () => {
    const md = sourceRef.current?.value ?? "";
    setSourceMd(md);
    onContentChange(md, filePath ?? undefined);
    if (filePath) onSave(filePath, md);
  };

  // ── 空状态：无文件打开时显示引导 ──

  const showEmptyState = !filePath;

  return (
    <div className="work-editor-canvas flex flex-col h-full">
      {/* File header */}
      {filePath && (<div className="flex items-center gap-2 px-5 py-2 border-b border-[var(--app-border)] min-w-0">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--app-text-tertiary)" strokeWidth="1.8" strokeLinecap="round" className="shrink-0">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
        </svg>
        <span className="text-xs font-medium truncate text-[var(--app-text-secondary)] min-w-0">{filePath}</span>
        <div className="flex items-center gap-2 ml-auto shrink-0">
        {isStreaming && (
          <span className="flex items-center gap-1 text-[10px] text-[var(--app-accent)] shrink-0">
            <span className="w-1 h-1 rounded-full bg-[var(--app-accent)] animate-pulse" /> writing
          </span>
        )}
        {!isStreaming && showSaved && (
          <span className="text-[10px] text-[var(--app-text-tertiary)] shrink-0">✓ 已保存</span>
        )}
        <button onClick={toggleSource}
          className="w-6 h-6 rounded flex items-center justify-center hover:bg-[var(--app-accent-bg)] transition-colors shrink-0"
          title={sourceView ? "所见即所得" : "Markdown 源码"}>
          {sourceView ? (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--app-text-secondary)" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
          ) : (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--app-text-secondary)" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
          )}
        </button>
        {onClose && (
          <button onClick={() => { flushEditor(); onClose(); }} className="w-6 h-6 rounded flex items-center justify-center hover:bg-[var(--app-red-bg)] transition-colors shrink-0" title="Close">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--app-red)" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        )}
        </div>
      </div>)}

      {/* Source view */}
      <div className="flex-1 overflow-auto" style={{ display: sourceView && !showEmptyState ? "block" : "none" }}>
        <div className="work-editor-paper work-editor-source-paper">
          <textarea ref={sourceRef} value={sourceMd}
            onChange={handleSourceEdit}
            className="w-full text-[13.5px] leading-7 outline-none resize-none border-0 bg-transparent"
            style={{ color: "var(--app-text-secondary)", tabSize: 2, padding: "48px 48px", fontFamily: "'JetBrains Mono', Menlo, Monaco, monospace" }}
            spellCheck={false} placeholder="Markdown source..." />
        </div>
      </div>

      {/* Preview view */}
      <div className="flex-1 overflow-auto" style={{ display: sourceView && !showEmptyState ? "none" : "block" }}>
        {showEmptyState ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center space-y-4 max-w-sm px-8">
              <div className="text-4xl">📄</div>
              <p className="text-sm text-[var(--app-text-tertiary)] leading-relaxed">
                选择一个文件开始编辑，<br />
                或在聊天框输入 <code className="px-1 py-0.5 rounded bg-[var(--app-surface)] text-[var(--app-text-secondary)] text-xs">@Agent名 帮我写一份文档</code>
              </p>
              <div className="flex justify-center gap-4 text-xs text-[var(--app-text-tertiary)]">
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--app-accent)]" /> 左侧点文件打开
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--app-accent)]" /> Agent 自动生成
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="work-editor-paper">
            <div ref={containerRef} className="milkdown min-h-full" />
          </div>
        )}
      </div>
    </div>
  );
}

export default DocumentEditor;