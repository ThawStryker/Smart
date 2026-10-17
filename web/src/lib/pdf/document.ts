/** Word 编辑页自己的文档格式。不是 Markdown，也不交给 Milkdown。下载时再写成 docx。 */

export const PDF_FORMAT = "smart-pdf";
export const PDF_VERSION = 1;

/** 太大、放不进数据库的文件，库里只留这个指针，正文在附件存储。 */
export const PDF_FILE_FORMAT = "smart-pdf-file";

export interface PdfFilePointer {
  format: typeof PDF_FILE_FORMAT;
  version: 1;
  uri: string;
  encoding: "latin1" | "utf8";
}

export function readPdfFilePointer(raw: string): PdfFilePointer | null {
  if (!raw.startsWith("{")) return null;
  try {
    const data = JSON.parse(raw) as Partial<PdfFilePointer>;
    if (data.format !== PDF_FILE_FORMAT || data.version !== 1 || typeof data.uri !== "string") return null;
    if (data.encoding !== "latin1" && data.encoding !== "utf8") return null;
    return { format: PDF_FILE_FORMAT, version: 1, uri: data.uri, encoding: data.encoding };
  } catch {
    return null;
  }
}

/** 列宽比例的下限，避免一列被拖没。 */
export const PDF_COL_MIN = 0.08;

export const PDF_COLORS = {
  ink: "#1c1917",
  accent: "#4338ca",
  muted: "#78716c",
  red: "#b91c1c",
} as const;

/**
 * 编辑器纸张的设计宽度。下载时整页按这个宽度缩放到 A4，
 * 页边距、块间距、字号和行高用的是同一比例，所以版心和页面一致。
 */
export const PDF_PAPER_PX = 820;
export const PDF_PAGE_PT = { w: 595.28, h: 841.89 } as const;

export function pdfPx(px: number): number {
  return px * PDF_PAGE_PT.w / PDF_PAPER_PX;
}

/** 与 pdf-editor.css 里纸张、文字块的间距一致。格子内边距沿用文字块的内边距。 */
export const PDF_LAYOUT = {
  band: 64,
  bodyTop: 28,
  bodyX: 48,
  bodyBottom: 40,
  blockGap: 16,
  blockPadX: 12,
  blockPadY: 8,
  textFont: 15,
  textLine: 26,
  cellPadX: 12,
  cellPadY: 8,
} as const;

/** 正文档和文字块同一字号。小、大在它两侧各差一档。 */
export const PDF_FONT_PX = { sm: 12, md: PDF_LAYOUT.textFont, lg: 18 } as const;
const PDF_LINE_RATIO = PDF_LAYOUT.textLine / PDF_LAYOUT.textFont;

/** 一行文字的行框，比例和文字块的 15px / 26px 相同。 */
export function cellLinePx(size?: PdfFontSize): number {
  if (!size || size === "md") return PDF_LAYOUT.textLine;
  return Math.round(PDF_FONT_PX[size] * PDF_LINE_RATIO);
}

/** 页面上的字号。Word 带来的磅值优先，否则用小、中、大。 */
export function lookFontPx(cell: { size?: PdfFontSize; fontPt?: number }): number {
  if (cell.fontPt && cell.fontPt > 0) return Math.round(cell.fontPt * PDF_PAPER_PX / PDF_PAGE_PT.w);
  return PDF_FONT_PX[cell.size || "md"];
}

export function lookLinePx(cell: { size?: PdfFontSize; fontPt?: number; linePx?: number }): number {
  if (cell.linePx && cell.linePx > 0) return Math.round(cell.linePx);
  return Math.max(1, Math.round(lookFontPx(cell) * PDF_LINE_RATIO));
}

export function textLook(cell: PdfCell): {
  textAlign: PdfAlign;
  fontWeight: number;
  fontSize: number;
  lineHeight: string;
  color: string;
  fontFamily?: string;
  fontStyle?: "italic";
  textDecoration?: "underline";
  textIndent?: string;
  paddingLeft?: string;
  backgroundColor?: string;
} {
  return {
    textAlign: cell.align || "left",
    fontWeight: cell.bold ? 700 : 400,
    fontSize: lookFontPx(cell),
    lineHeight: `${lookLinePx(cell)}px`,
    color: cell.colorHex || PDF_COLORS[cell.color || "ink"],
    fontFamily: cell.fontFamily ? `"${cell.fontFamily}", "PingFang SC", "Microsoft YaHei", sans-serif` : undefined,
    fontStyle: cell.italic ? "italic" : undefined,
    textDecoration: cell.underline ? "underline" : undefined,
    textIndent: cell.firstIndent ? `${cell.firstIndent}px` : undefined,
    paddingLeft: cell.indent ? `${cell.indent}px` : undefined,
    backgroundColor: cell.fill,
  };
}

/** 一格的高度：若干行文字，再加上和文字块一样的上下内边距。 */
export function cellBoxPx(size: PdfFontSize | undefined, lines: number): number {
  return Math.max(1, lines) * cellLinePx(size) + PDF_LAYOUT.cellPadY * 2;
}

/** 这一行里最大字号的一行高度，也是拖动时的下限。 */
export function rowFloorPx(row: { size?: PdfFontSize; fontPt?: number; linePx?: number }[]): number {
  const pad = PDF_LAYOUT.cellPadY * 2;
  return row.reduce((max, cell) => Math.max(max, lookLinePx(cell) + pad), lookLinePx({}) + pad);
}

/** 编辑器里的行高（像素）：不小于一行加内边距，也不小于拖出来的高度和换行后的内容。 */
export function rowBoxPx(row: { size?: PdfFontSize; fontPt?: number; linePx?: number }[], lineCounts: number[], minPx: number): number {
  let content = rowFloorPx(row);
  const pad = PDF_LAYOUT.cellPadY * 2;
  row.forEach((cell, index) => {
    content = Math.max(content, Math.max(1, lineCounts[index] || 1) * lookLinePx(cell) + pad);
  });
  return Math.max(content, minPx);
}

export type PdfFontSize = keyof typeof PDF_FONT_PX;
export type PdfAlign = "left" | "center" | "right";
export type PdfVAlign = "top" | "middle" | "bottom";
export type PdfColor = keyof typeof PDF_COLORS;

export interface PdfTextBlock extends PdfCell {
  id: string;
  type: "text";
}

/** 一格一种格式。未写的字段用默认：正文、左对齐、墨色、不加粗。从 Word 读来的字号和颜色放在 fontPt、colorHex 上。 */
export interface PdfCell {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  size?: PdfFontSize;
  align?: PdfAlign;
  /** 表格格内上下对齐。缺省贴顶。 */
  vAlign?: PdfVAlign;
  color?: PdfColor;
  /** 磅。有它时页面按这个字号画。 */
  fontPt?: number;
  /** #rrggbb，优先于 color。 */
  colorHex?: string;
  fontFamily?: string;
  /** 段前、段后、左缩进、首行缩进、行高，都是编辑区像素。 */
  spaceBefore?: number;
  spaceAfter?: number;
  indent?: number;
  firstIndent?: number;
  linePx?: number;
  /** 单元格底色 #rrggbb。 */
  fill?: string;
  /** 格子里的图。 */
  pictures?: PdfPicture[];
}

export interface PdfTableBlock {
  id: string;
  type: "table";
  rows: PdfCell[][];
  /** 列宽比例，和为 1。缺省则均分。 */
  colWidths?: number[];
  /** 行最小高度，单位是编辑区像素。0 表示按内容撑开。 */
  rowMinHeights?: number[];
  /** 这一段从原表的第几行开始。只在分页显示时用，改格子要加回原表。 */
  rowOffset?: number;
}

export interface PdfPicture {
  src: string;
  width: number;
  height: number;
}

export interface PdfImageBlock extends PdfPicture {
  id: string;
  type: "image";
}

export interface PdfPageBreakBlock {
  id: string;
  type: "pageBreak";
}

/** 页眉页脚里的页码占位。画页面和下载时再换成真正的页码。 */
export const PDF_PAGE_MARK = "\u0001PAGE\u0001";
export const PDF_PAGES_MARK = "\u0001PAGES\u0001";

export interface PdfPageSetup {
  width: number;
  height: number;
  marginTop: number;
  marginRight: number;
  marginBottom: number;
  marginLeft: number;
}

/** 垫在整页文字后面的图，比如页眉里的纸张底板。 */
export interface PdfBackdrop {
  src: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export type PdfBlock = PdfTextBlock | PdfTableBlock | PdfImageBlock | PdfPageBreakBlock;

export interface PdfDocument {
  format: typeof PDF_FORMAT;
  version: typeof PDF_VERSION;
  blocks: PdfBlock[];
  header?: PdfBlock[];
  footer?: PdfBlock[];
  firstHeader?: PdfBlock[];
  firstFooter?: PdfBlock[];
  page?: PdfPageSetup;
  /** 每一页文字下面的底板。首页如果单独有，放在 firstBackdrop。 */
  backdrop?: PdfBackdrop[];
  firstBackdrop?: PdfBackdrop[];
}

/** docx 走编辑页。已经建好的 pdf 也留在这一页，避免打开成一堆 JSON。 */
export function isWordPath(path: string | null | undefined): boolean {
  if (!path) return false;
  const lower = path.toLowerCase();
  return lower.endsWith(".docx") || lower.endsWith(".pdf");
}

export function isPdfPath(path: string | null | undefined): boolean {
  return isWordPath(path);
}

/** 上传的 docx 是压缩包，开头是 PK。 */
export function isDocxBinary(raw: string): boolean {
  return raw.startsWith("PK\u0003\u0004");
}

function nextId(): string {
  return `b_${Math.random().toString(36).slice(2, 10)}`;
}

function emptyCell(): PdfCell {
  return { text: "" };
}

function hexColor(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const hex = value.startsWith("#") ? value.slice(1) : value;
  return /^[0-9a-fA-F]{6}$/.test(hex) ? `#${hex.toLowerCase()}` : undefined;
}

function readPx(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.round(value) : undefined;
}

function readPictures(value: unknown): PdfPicture[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const pictures: PdfPicture[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const raw = item as Partial<PdfPicture>;
    if (typeof raw.src !== "string" || !raw.src.startsWith("data:image/") || raw.src.length > 12_000_000) continue;
    pictures.push({
      src: raw.src,
      width: readPx(raw.width) || 160,
      height: readPx(raw.height) || 90,
    });
  }
  return pictures.length > 0 ? pictures : undefined;
}

function readStyle(raw: Partial<PdfCell>, target: PdfTextBlock | PdfCell) {
  if (raw.bold === true) target.bold = true;
  if (raw.italic === true) target.italic = true;
  if (raw.underline === true) target.underline = true;
  if (raw.size === "sm" || raw.size === "lg") target.size = raw.size;
  if (raw.align === "center" || raw.align === "right") target.align = raw.align;
  if (raw.vAlign === "middle" || raw.vAlign === "bottom") target.vAlign = raw.vAlign;
  if (raw.color === "accent" || raw.color === "muted" || raw.color === "red") target.color = raw.color;
  if (typeof raw.fontPt === "number" && raw.fontPt > 0) target.fontPt = raw.fontPt;
  const colorHex = hexColor(raw.colorHex);
  if (colorHex) target.colorHex = colorHex;
  if (typeof raw.fontFamily === "string" && raw.fontFamily.trim()) target.fontFamily = raw.fontFamily.trim();
  const spaceBefore = readPx(raw.spaceBefore);
  const spaceAfter = readPx(raw.spaceAfter);
  const indent = readPx(raw.indent);
  const firstIndent = typeof raw.firstIndent === "number" && Number.isFinite(raw.firstIndent) ? Math.round(raw.firstIndent) : undefined;
  const linePx = readPx(raw.linePx);
  if (spaceBefore != null) target.spaceBefore = spaceBefore;
  if (spaceAfter != null) target.spaceAfter = spaceAfter;
  if (indent != null) target.indent = indent;
  if (firstIndent != null) target.firstIndent = firstIndent;
  if (linePx != null) target.linePx = linePx;
  const fill = hexColor(raw.fill);
  if (fill) target.fill = fill;
  const pictures = readPictures(raw.pictures);
  if (pictures) target.pictures = pictures;
}

function tidyStyle<T extends PdfTextBlock | PdfCell>(block: T): T {
  if (!block.bold) delete block.bold;
  if (!block.italic) delete block.italic;
  if (!block.underline) delete block.underline;
  if (!block.size || block.size === "md") delete block.size;
  if (!block.align || block.align === "left") delete block.align;
  if (!block.vAlign || block.vAlign === "top") delete block.vAlign;
  if (!block.color || block.color === "ink") delete block.color;
  if (!(block.fontPt && block.fontPt > 0)) delete block.fontPt;
  if (!block.colorHex) delete block.colorHex;
  if (!block.fontFamily) delete block.fontFamily;
  if (block.spaceBefore == null) delete block.spaceBefore;
  if (block.spaceAfter == null) delete block.spaceAfter;
  if (!block.indent) delete block.indent;
  if (!block.firstIndent) delete block.firstIndent;
  if (!block.linePx) delete block.linePx;
  if (!block.fill) delete block.fill;
  if (!block.pictures?.length) delete block.pictures;
  return block;
}

function applyStylePatch<T extends PdfTextBlock | PdfCell>(current: T, patch: Partial<PdfCell>): T {
  const next = { ...current, ...patch, text: patch.text ?? current.text };
  if ("size" in patch) delete next.fontPt;
  if ("color" in patch) delete next.colorHex;
  return tidyStyle(next);
}

function asCell(value: unknown): PdfCell {
  if (typeof value === "string") return { text: value };
  if (!value || typeof value !== "object") return emptyCell();
  const raw = value as Partial<PdfCell>;
  const cell: PdfCell = { text: typeof raw.text === "string" ? raw.text : "" };
  readStyle(raw, cell);
  // 表格格内图不进入编辑页；改过列宽后落盘的 JSON 也一并丢掉。
  delete cell.pictures;
  return cell;
}

function normalizeRows(rows: PdfCell[][]): PdfCell[][] {
  const source = rows.length > 0 ? rows : [[emptyCell()]];
  const width = Math.max(1, ...source.map((row) => row.length));
  return source.map((row) => {
    const next = row.map(asCell);
    while (next.length < width) next.push(emptyCell());
    return next.slice(0, width);
  });
}

export function columnWidths(table: Pick<PdfTableBlock, "rows" | "colWidths">): number[] {
  const count = Math.max(1, table.rows[0]?.length || 0);
  const raw = table.colWidths;
  if (!raw || raw.length !== count || raw.some((width) => !(width > 0))) {
    return Array.from({ length: count }, () => 1 / count);
  }
  const sum = raw.reduce((total, width) => total + width, 0) || 1;
  return raw.map((width) => width / sum);
}

export function resizePdfColumns(widths: number[], index: number, delta: number): number[] {
  if (index < 0 || index >= widths.length - 1) return widths;
  const next = [...widths];
  let shift = delta;
  if (next[index] + shift < PDF_COL_MIN) shift = PDF_COL_MIN - next[index];
  if (next[index + 1] - shift < PDF_COL_MIN) shift = next[index + 1] - PDF_COL_MIN;
  next[index] += shift;
  next[index + 1] -= shift;
  return next;
}

function normalizeTable(block: PdfTableBlock): PdfTableBlock {
  const rows = normalizeRows(block.rows);
  const count = rows[0].length;
  const colWidths = block.colWidths && block.colWidths.length === count
    ? columnWidths({ rows, colWidths: block.colWidths })
    : undefined;
  let rowMinHeights: number[] | undefined;
  if (block.rowMinHeights?.some((height) => height > 0)) {
    rowMinHeights = rows.map((_, index) => {
      const height = block.rowMinHeights?.[index] ?? 0;
      return height > 0 ? Math.round(height) : 0;
    });
  }
  return {
    id: block.id,
    type: "table",
    rows,
    ...(colWidths ? { colWidths } : {}),
    ...(rowMinHeights ? { rowMinHeights } : {}),
  };
}

function tableBlock(id: string, rows: PdfCell[][]): PdfTableBlock {
  return normalizeTable({ id, type: "table", rows });
}

export function createPdfDocument(): PdfDocument {
  return {
    format: PDF_FORMAT,
    version: PDF_VERSION,
    blocks: [{ id: nextId(), type: "text", text: "" }],
  };
}

export function serializePdfDocument(doc: PdfDocument): string {
  return JSON.stringify(doc);
}

export function paperBox(doc: Pick<PdfDocument, "page">): { width: number; height: number } {
  return {
    width: doc.page?.width ?? PDF_PAPER_PX,
    height: doc.page?.height ?? Math.round(PDF_PAPER_PX * PDF_PAGE_PT.h / PDF_PAGE_PT.w),
  };
}

function contentWidthOf(doc: Pick<PdfDocument, "page">): number {
  const box = paperBox(doc);
  const left = doc.page?.marginLeft ?? PDF_LAYOUT.bodyX;
  const right = doc.page?.marginRight ?? PDF_LAYOUT.bodyX;
  return Math.max(160, box.width - left - right);
}

/** 汉字按一字宽，英文、数字和半角符号大约半个字。满字宽会把混排多算成换行，页底就空出一块。 */
function textWidthPx(text: string, fontPx: number): number {
  let width = 0;
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    width += code <= 0xff ? fontPx * 0.55 : fontPx;
  }
  return width;
}

function wrappedLineCount(text: string, innerWidth: number, fontPx: number): number {
  const width = Math.max(fontPx, innerWidth);
  return text.split("\n").reduce((sum, line) => {
    if (!line) return sum + 1;
    return sum + Math.max(1, Math.ceil(textWidthPx(line, fontPx) / width));
  }, 0);
}

function textBlockHeight(block: PdfTextBlock, contentWidth: number): number {
  const font = lookFontPx(block);
  const padX = block.spaceBefore == null && block.spaceAfter == null ? PDF_LAYOUT.blockPadX * 2 : 0;
  const inner = contentWidth - padX - (block.indent ?? 0) - (block.firstIndent ?? 0);
  const lines = wrappedLineCount(block.text, inner, font);
  const before = block.spaceBefore ?? 0;
  const after = block.spaceAfter ?? PDF_LAYOUT.blockGap;
  const padY = block.spaceBefore == null && block.spaceAfter == null ? PDF_LAYOUT.blockPadY * 2 : 0;
  return before + lines * lookLinePx(block) + after + padY;
}

/** 表格外框：文字块的内边距和块间距。每一段续表都要算一次。 */
const TABLE_FRAME = PDF_LAYOUT.blockPadY * 2 + PDF_LAYOUT.blockGap;

function tableRowHeight(table: PdfTableBlock, index: number, frameWidth: number): number {
  const row = table.rows[index] || [];
  const widths = columnWidths(table);
  const heights = row.map((cell, col) => {
    const font = lookFontPx(cell);
    const share = frameWidth * (widths[col] ?? 0);
    const inner = Math.max(font, share - PDF_LAYOUT.cellPadX * 2 - (cell.indent ?? 0));
    const lines = wrappedLineCount(cell.text, inner, font);
    const pictures = (cell.pictures ?? []).reduce((sum, picture) => {
      const scale = picture.width > inner ? inner / picture.width : 1;
      return sum + picture.height * scale;
    }, 0);
    return lines * lookLinePx(cell) + PDF_LAYOUT.cellPadY * 2 + pictures;
  });
  return Math.max(table.rowMinHeights?.[index] ?? 0, ...heights, 0);
}

function tableFrameWidth(contentWidth: number): number {
  return Math.max(80, contentWidth - PDF_LAYOUT.blockPadX * 2);
}

/** 一块在纸上大概占多高。用来把长文分成多页。 */
export function blockHeightPx(block: PdfBlock, contentWidth = PDF_PAPER_PX - PDF_LAYOUT.bodyX * 2): number {
  if (block.type === "pageBreak") return 0;
  if (block.type === "image") return block.height + PDF_LAYOUT.blockGap;
  if (block.type === "text") return textBlockHeight(block, contentWidth);
  const frame = tableFrameWidth(contentWidth);
  return TABLE_FRAME + block.rows.reduce((sum, _, index) => sum + tableRowHeight(block, index, frame), 0);
}

function sliceTable(table: PdfTableBlock, start: number, count: number): PdfTableBlock {
  return {
    id: table.id,
    type: "table",
    rows: table.rows.slice(start, start + count),
    ...(table.colWidths ? { colWidths: table.colWidths } : {}),
    ...(table.rowMinHeights ? { rowMinHeights: table.rowMinHeights.slice(start, start + count) } : {}),
    ...(start > 0 ? { rowOffset: start } : {}),
  };
}

/**
 * 换页符另起一页。超过纸高的表格按行拆开，标题和表格开头留在同一页。
 * 这样长表不会把纸撑出底板，也不会让标题独自占一页。
 */
export function layoutPages(doc: PdfDocument): PdfBlock[][] {
  const box = paperBox(doc);
  const top = doc.page?.marginTop ?? PDF_LAYOUT.bodyTop;
  const bottom = doc.page?.marginBottom ?? PDF_LAYOUT.bodyBottom;
  const limit = Math.max(160, box.height - top - bottom);
  const width = contentWidthOf(doc);
  const frame = tableFrameWidth(width);
  const pages: PdfBlock[][] = [[]];
  let used = 0;
  const nextPage = () => {
    pages.push([]);
    used = 0;
  };
  const placeTable = (table: PdfTableBlock) => {
    let start = 0;
    while (start < table.rows.length) {
      const first = tableRowHeight(table, start, frame);
      if (used > 0 && used + TABLE_FRAME + first > limit) nextPage();
      const room = Math.max(0, limit - used);
      let height = TABLE_FRAME;
      let count = 0;
      while (start + count < table.rows.length) {
        const rowHeight = tableRowHeight(table, start + count, frame);
        if (count > 0 && height + rowHeight > room) break;
        height += rowHeight;
        count += 1;
        if (height >= room) break;
      }
      if (count < 1) count = 1;
      pages[pages.length - 1].push(sliceTable(table, start, count));
      used += height;
      start += count;
    }
  };
  for (const block of doc.blocks) {
    if (block.type === "pageBreak") {
      nextPage();
      continue;
    }
    if (block.type === "table") {
      placeTable(block);
      continue;
    }
    const height = blockHeightPx(block, width);
    if (used > 0 && used + height > limit) nextPage();
    pages[pages.length - 1].push(block);
    used += height;
  }
  while (pages.length > 1 && pages[pages.length - 1].length === 0) pages.pop();
  return pages.length > 0 ? pages : [[]];
}

export type PdfLoad =
  | { kind: "document"; doc: PdfDocument }
  | { kind: "binary" }
  | { kind: "remote" };

function readContentBlock(block: Partial<PdfBlock>): PdfBlock | null {
  if (!block || typeof block !== "object") return null;
  if (block.type === "pageBreak") {
    return { id: typeof block.id === "string" ? block.id : nextId(), type: "pageBreak" };
  }
  if (block.type === "image") {
    const picture = readPictures([block])?.[0];
    if (!picture) return null;
    return { id: typeof block.id === "string" ? block.id : nextId(), type: "image", ...picture };
  }
  if (block.type === "text") {
    const textBlock: PdfTextBlock = {
      id: typeof block.id === "string" ? block.id : nextId(),
      type: "text",
      text: typeof block.text === "string" ? block.text : "",
    };
    readStyle(block, textBlock);
    return textBlock;
  }
  if (block.type !== "table") return null;
  const source = block as Partial<PdfTableBlock>;
  const rows = Array.isArray(source.rows)
    ? source.rows.filter((row) => Array.isArray(row)).map((row) => row.map((cell) => asCell(cell)))
    : [[emptyCell()]];
  const colWidths = Array.isArray(source.colWidths)
    ? source.colWidths.map((width) => Number(width)).filter((width) => width > 0)
    : undefined;
  const rowMinHeights = Array.isArray(source.rowMinHeights)
    ? source.rowMinHeights.map((height) => Number(height) || 0)
    : undefined;
  return normalizeTable({
    id: typeof source.id === "string" ? source.id : nextId(),
    type: "table",
    rows,
    colWidths,
    rowMinHeights,
  });
}

function readBlocks(value: unknown): PdfBlock[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((block) => {
    const next = readContentBlock(block as Partial<PdfBlock>);
    return next ? [next] : [];
  });
}

function readStory(value: unknown): PdfBlock[] | undefined {
  const blocks = readBlocks(value).filter((block) => block.type !== "pageBreak" && (block.type !== "text" || block.text.trim().length > 0 || block.text.includes(PDF_PAGE_MARK) || block.text.includes(PDF_PAGES_MARK)));
  return blocks.length > 0 ? blocks : undefined;
}

function readBackdrops(value: unknown): PdfBackdrop[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items: PdfBackdrop[] = [];
  for (const item of value) {
    const picture = readPictures([item])?.[0];
    if (!picture || !item || typeof item !== "object") continue;
    const raw = item as Partial<PdfBackdrop>;
    items.push({
      ...picture,
      x: typeof raw.x === "number" && Number.isFinite(raw.x) ? Math.round(raw.x) : 0,
      y: typeof raw.y === "number" && Number.isFinite(raw.y) ? Math.round(raw.y) : 0,
    });
  }
  return items.length > 0 ? items : undefined;
}

function readPage(value: unknown): PdfPageSetup | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Partial<PdfPageSetup>;
  const width = readPx(raw.width);
  const height = readPx(raw.height);
  if (!width || !height) return undefined;
  return {
    width,
    height,
    marginTop: readPx(raw.marginTop) ?? PDF_LAYOUT.bodyTop,
    marginRight: readPx(raw.marginRight) ?? PDF_LAYOUT.bodyX,
    marginBottom: readPx(raw.marginBottom) ?? PDF_LAYOUT.bodyBottom,
    marginLeft: readPx(raw.marginLeft) ?? PDF_LAYOUT.bodyX,
  };
}

/** 通识课教案表格正文：12 磅微软雅黑、左对齐、无底色。旧稿行高 22/26，打开时抬到 30。 */
const TONGSHI_BODY_LINE_PX = 30;

function isTongshiLesson(blocks: PdfBlock[]): boolean {
  const titles = new Set(blocks.filter((block) => block.type === "text").map((block) => block.text));
  return titles.has("教案文档") && titles.has("三、教学重难点");
}

function isTongshiBodyCell(cell: PdfCell): boolean {
  if (cell.fontPt !== 12 || cell.fontFamily !== "微软雅黑" || cell.fill) return false;
  if (cell.align && cell.align !== "left") return false;
  if (cell.vAlign && cell.vAlign !== "top") return false;
  return true;
}

function bumpTongshiBodyLine(doc: PdfDocument): PdfDocument {
  if (!isTongshiLesson(doc.blocks)) return doc;
  let changed = false;
  const blocks = doc.blocks.map((block) => {
    if (block.type !== "table") return block;
    return {
      ...block,
      rows: block.rows.map((row) => row.map((cell) => {
        if (!isTongshiBodyCell(cell) || (cell.linePx !== 22 && cell.linePx !== 26)) return cell;
        changed = true;
        return { ...cell, linePx: TONGSHI_BODY_LINE_PX };
      })),
    };
  });
  return changed ? { ...doc, blocks } : doc;
}

export function loadPdfContent(raw: string): PdfLoad {
  if (raw.startsWith("%PDF") || raw.startsWith("PK\u0003\u0004")) return { kind: "binary" };
  if (readPdfFilePointer(raw)) return { kind: "remote" };
  if (!raw.trim()) return { kind: "document", doc: createPdfDocument() };
  try {
    const data = JSON.parse(raw) as Partial<PdfDocument>;
    if (data.format !== PDF_FORMAT || !Array.isArray(data.blocks)) {
      return { kind: "document", doc: createPdfDocument() };
    }
    const blocks = readBlocks(data.blocks);
    const header = readStory(data.header);
    const footer = readStory(data.footer);
    const firstHeader = readStory(data.firstHeader);
    const firstFooter = readStory(data.firstFooter);
    const page = readPage(data.page);
    const backdrop = readBackdrops(data.backdrop);
    const firstBackdrop = readBackdrops(data.firstBackdrop);
    const doc = bumpTongshiBodyLine({
      format: PDF_FORMAT,
      version: PDF_VERSION,
      blocks: blocks.length > 0 ? blocks : createPdfDocument().blocks,
      ...(header ? { header } : {}),
      ...(footer ? { footer } : {}),
      ...(firstHeader ? { firstHeader } : {}),
      ...(firstFooter ? { firstFooter } : {}),
      ...(page ? { page } : {}),
      ...(backdrop ? { backdrop } : {}),
      ...(firstBackdrop ? { firstBackdrop } : {}),
    });
    return { kind: "document", doc };
  } catch {
    return { kind: "document", doc: createPdfDocument() };
  }
}

function mapTable(doc: PdfDocument, id: string, update: (block: PdfTableBlock) => PdfTableBlock): PdfDocument {
  return {
    ...doc,
    blocks: doc.blocks.map((block) => {
      if (block.type !== "table" || block.id !== id) return block;
      return normalizeTable(update({
        ...block,
        rows: block.rows.map((row) => row.map((cell) => ({ ...cell }))),
        colWidths: block.colWidths ? [...block.colWidths] : undefined,
        rowMinHeights: block.rowMinHeights ? [...block.rowMinHeights] : undefined,
      }));
    }),
  };
}

function insertBlockAfter(doc: PdfDocument, afterId: string, block: PdfBlock): PdfDocument {
  const index = doc.blocks.findIndex((item) => item.id === afterId);
  const blocks = [...doc.blocks];
  blocks.splice(index < 0 ? blocks.length : index + 1, 0, block);
  return { ...doc, blocks };
}

export function updatePdfText(doc: PdfDocument, id: string, text: string): PdfDocument {
  return {
    ...doc,
    blocks: doc.blocks.map((block) => (block.type === "text" && block.id === id ? { ...block, text } : block)),
  };
}

export function patchPdfText(doc: PdfDocument, id: string, patch: Partial<PdfCell>): PdfDocument {
  return {
    ...doc,
    blocks: doc.blocks.map((block) => {
      if (block.type !== "text" || block.id !== id) return block;
      return applyStylePatch(block, patch);
    }),
  };
}

export function patchPdfCell(doc: PdfDocument, id: string, row: number, col: number, patch: Partial<PdfCell>): PdfDocument {
  return mapTable(doc, id, (block) => {
    if (!block.rows[row] || col < 0 || col >= block.rows[row].length) return block;
    const current = block.rows[row][col];
    const next = applyStylePatch(current, patch);
    const rows = block.rows.map((line) => [...line]);
    rows[row][col] = next;
    return { ...block, rows };
  });
}

export function updatePdfCell(doc: PdfDocument, id: string, row: number, col: number, value: string): PdfDocument {
  return patchPdfCell(doc, id, row, col, { text: value });
}

export function setPdfColumnWidths(doc: PdfDocument, id: string, widths: number[]): PdfDocument {
  return mapTable(doc, id, (block) => ({ ...block, colWidths: widths }));
}

export function resetPdfColumnWidths(doc: PdfDocument, id: string): PdfDocument {
  return mapTable(doc, id, (block) => ({ ...block, colWidths: undefined }));
}

export function setPdfRowMinHeight(doc: PdfDocument, id: string, row: number, height: number): PdfDocument {
  return mapTable(doc, id, (block) => {
    const rowMinHeights = block.rows.map((_, index) => block.rowMinHeights?.[index] ?? 0);
    if (row < 0 || row >= rowMinHeights.length) return block;
    rowMinHeights[row] = Math.max(0, Math.round(height));
    return { ...block, rowMinHeights };
  });
}

export function insertPdfTableRow(doc: PdfDocument, id: string, index: number): PdfDocument {
  return mapTable(doc, id, (block) => {
    const width = block.rows[0]?.length || 1;
    const rows = block.rows.map((row) => [...row]);
    const at = Math.max(0, Math.min(index, rows.length));
    rows.splice(at, 0, Array.from({ length: width }, emptyCell));
    const rowMinHeights = block.rowMinHeights
      ? block.rows.map((_, rowIndex) => block.rowMinHeights?.[rowIndex] ?? 0)
      : undefined;
    if (rowMinHeights) rowMinHeights.splice(at, 0, 0);
    return { ...block, rows, rowMinHeights };
  });
}

export function addPdfTableRow(doc: PdfDocument, id: string): PdfDocument {
  const table = doc.blocks.find((block) => block.type === "table" && block.id === id);
  const index = table && table.type === "table" ? table.rows.length : 0;
  return insertPdfTableRow(doc, id, index);
}

export function insertPdfTableColumn(doc: PdfDocument, id: string, index: number): PdfDocument {
  return mapTable(doc, id, (block) => {
    const count = block.rows[0]?.length || 1;
    const at = Math.max(0, Math.min(index, count));
    const rows = block.rows.map((row) => {
      const next = [...row];
      next.splice(at, 0, emptyCell());
      return next;
    });
    const widths = columnWidths(block);
    const share = 1 / (widths.length + 1);
    const scaled = widths.map((width) => width * (1 - share));
    scaled.splice(at, 0, share);
    return { ...block, rows, colWidths: scaled };
  });
}

export function addPdfTableColumn(doc: PdfDocument, id: string): PdfDocument {
  const table = doc.blocks.find((block) => block.type === "table" && block.id === id);
  const index = table && table.type === "table" ? (table.rows[0]?.length || 0) : 0;
  return insertPdfTableColumn(doc, id, index);
}

export function removePdfTableRow(doc: PdfDocument, id: string, index: number): PdfDocument {
  return mapTable(doc, id, (block) => {
    if (block.rows.length <= 1) return block;
    const rowMinHeights = block.rowMinHeights?.filter((_, rowIndex) => rowIndex !== index);
    return {
      ...block,
      rows: block.rows.filter((_, rowIndex) => rowIndex !== index),
      rowMinHeights,
    };
  });
}

export function removePdfTableColumn(doc: PdfDocument, id: string, index: number): PdfDocument {
  return mapTable(doc, id, (block) => {
    if ((block.rows[0]?.length || 0) <= 1) return block;
    const rows = block.rows.map((row) => row.filter((_, colIndex) => colIndex !== index));
    if (!block.colWidths) return { ...block, rows };
    const kept = columnWidths(block).filter((_, colIndex) => colIndex !== index);
    const sum = kept.reduce((total, width) => total + width, 0) || 1;
    return { ...block, rows, colWidths: kept.map((width) => width / sum) };
  });
}

export function addPdfTextBlock(doc: PdfDocument): PdfDocument {
  return { ...doc, blocks: [...doc.blocks, { id: nextId(), type: "text", text: "" }] };
}

export function addPdfTextBlockAfter(doc: PdfDocument, afterId: string): PdfDocument {
  return insertBlockAfter(doc, afterId, { id: nextId(), type: "text", text: "" });
}

export function addPdfTableBlock(doc: PdfDocument): PdfDocument {
  return {
    ...doc,
    blocks: [...doc.blocks, tableBlock(nextId(), [[emptyCell(), emptyCell()], [emptyCell(), emptyCell()]])],
  };
}

export function addPdfTableBlockAfter(doc: PdfDocument, afterId: string): PdfDocument {
  return insertBlockAfter(doc, afterId, tableBlock(nextId(), [[emptyCell(), emptyCell()], [emptyCell(), emptyCell()]]));
}

export function removePdfBlock(doc: PdfDocument, id: string): PdfDocument {
  const blocks = doc.blocks.filter((block) => block.id !== id);
  return { ...doc, blocks: blocks.length > 0 ? blocks : createPdfDocument().blocks };
}
