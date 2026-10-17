/** 把上传的 docx 读成编辑页上的文字、表格、图片、页眉页脚和分页。 */
import JSZip from "jszip";
import {
  PDF_FORMAT,
  PDF_PAGE_MARK,
  PDF_PAGE_PT,
  PDF_PAGES_MARK,
  PDF_PAPER_PX,
  PDF_VERSION,
  type PdfAlign,
  type PdfBackdrop,
  type PdfBlock,
  type PdfCell,
  type PdfDocument,
  type PdfImageBlock,
  type PdfPageSetup,
  type PdfPicture,
  type PdfTableBlock,
} from "./document";

interface StyleDef {
  basedOn?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  size?: number;
  color?: string;
  fontFamily?: string;
  align?: string;
  before?: number;
  after?: number;
  line?: number;
  lineRule?: string;
  indent?: number;
  firstIndent?: number;
  fill?: string;
  /** 表格样式里表头行的底色，不进段落。 */
  headerFill?: string;
}

function nextId(): string {
  return `b_${Math.random().toString(36).slice(2, 10)}`;
}

function latin1Bytes(text: string): Uint8Array {
  const bytes = new Uint8Array(text.length);
  for (let index = 0; index < text.length; index += 1) bytes[index] = text.charCodeAt(index) & 0xff;
  return bytes;
}

function attr(element: Element | null | undefined, name: string): string | null {
  if (!element) return null;
  return element.getAttribute(`w:${name}`) ?? element.getAttribute(name);
}

function first(element: Element | null | undefined, name: string): Element | null {
  if (!element) return null;
  for (const child of element.children) {
    if (child.localName === name) return child;
  }
  return null;
}

function parseXml(xml: string): Document {
  return new DOMParser().parseFromString(xml, "application/xml");
}

function flag(element: Element | null, name: string): boolean | undefined {
  const node = first(element, name);
  if (!node) return undefined;
  const value = attr(node, "val");
  if (value == null || value === "1" || value === "true" || value === "on") return true;
  return false;
}

function numberAttr(element: Element | null, name: string): number | undefined {
  const node = first(element, name);
  const value = Number(attr(node, "val"));
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

function rawNumber(element: Element | null, name: string): number | undefined {
  const raw = attr(element, name);
  if (raw == null || raw === "") return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

function shadeFill(element: Element | null): string | undefined {
  const fill = attr(first(element, "shd"), "fill");
  if (!fill || !/^[0-9a-fA-F]{6}$/.test(fill)) return undefined;
  return `#${fill.toLowerCase()}`;
}

function twipToPx(twip: number): number {
  return Math.round(twip * PDF_PAPER_PX / (PDF_PAGE_PT.w * 20));
}

function fontPx(halfPoints?: number): number {
  if (!halfPoints || halfPoints <= 0) return Math.round(15 * PDF_PAPER_PX / PDF_PAGE_PT.w);
  return Math.round(halfPoints / 2 * PDF_PAPER_PX / PDF_PAGE_PT.w);
}

const STYLE_KEYS = [
  "bold", "italic", "underline", "size", "color", "fontFamily", "align",
  "before", "after", "line", "lineRule", "indent", "firstIndent", "fill",
] as const;

function mergeStyle(base: StyleDef, over: StyleDef): StyleDef {
  const next: StyleDef = { ...base };
  for (const key of STYLE_KEYS) {
    if (over[key] !== undefined) Object.assign(next, { [key]: over[key] });
  }
  return next;
}

function readTheme(xml: string): Map<string, string> {
  const theme = new Map<string, string>();
  const scheme = [...parseXml(xml).getElementsByTagName("*")].find((node) => node.localName === "clrScheme");
  if (!scheme) return theme;
  for (const child of scheme.children) {
    const nodes = [...child.getElementsByTagName("*")];
    const hex = nodes.find((node) => node.localName === "srgbClr")?.getAttribute("val")
      ?? nodes.find((node) => node.localName === "sysClr")?.getAttribute("lastClr");
    if (hex && /^[0-9a-fA-F]{6}$/.test(hex)) theme.set(child.localName, hex.toLowerCase());
  }
  return theme;
}

function colorOf(rPr: Element | null, theme: Map<string, string>): string | undefined {
  const node = first(rPr, "color");
  if (!node) return undefined;
  const val = attr(node, "val");
  if (val && /^[0-9a-fA-F]{6}$/.test(val)) return `#${val.toLowerCase()}`;
  const named = theme.get(attr(node, "themeColor") || "");
  if (named) return `#${named}`;
  if (!val || val === "auto") {
    const ink = theme.get("dk1");
    return ink ? `#${ink}` : undefined;
  }
  return undefined;
}

function underlineOf(rPr: Element | null): boolean | undefined {
  const node = first(rPr, "u");
  if (!node) return undefined;
  const value = attr(node, "val");
  if (value === "none" || value === "false" || value === "0" || value === "off") return false;
  return true;
}

function fontOf(rPr: Element | null): string | undefined {
  const fonts = first(rPr, "rFonts");
  return attr(fonts, "eastAsia") || attr(fonts, "ascii") || attr(fonts, "hAnsi") || undefined;
}

function readRPr(rPr: Element | null, theme: Map<string, string>): StyleDef {
  if (!rPr) return {};
  return {
    bold: flag(rPr, "b"),
    italic: flag(rPr, "i"),
    underline: underlineOf(rPr),
    size: numberAttr(rPr, "sz"),
    color: colorOf(rPr, theme),
    fontFamily: fontOf(rPr),
  };
}

function readPPr(pPr: Element | null): StyleDef {
  if (!pPr) return {};
  const spacing = first(pPr, "spacing");
  const ind = first(pPr, "ind");
  const line = rawNumber(spacing, "line");
  const left = rawNumber(ind, "left") ?? rawNumber(ind, "start");
  const firstLine = rawNumber(ind, "firstLine");
  const hanging = rawNumber(ind, "hanging");
  return {
    align: attr(first(pPr, "jc"), "val") ?? undefined,
    before: rawNumber(spacing, "before"),
    after: rawNumber(spacing, "after"),
    line: line && line > 0 ? line : undefined,
    lineRule: line && line > 0 ? attr(spacing, "lineRule") ?? undefined : undefined,
    indent: left,
    firstIndent: hanging != null && hanging > 0 ? -hanging : firstLine,
    fill: shadeFill(pPr),
  };
}

function headerFillOf(style: Element): string | undefined {
  for (const child of style.children) {
    if (child.localName !== "tblStylePr") continue;
    const type = attr(child, "type");
    if (type !== "firstRow") continue;
    const fill = shadeFill(first(child, "tcPr"));
    if (fill) return fill;
  }
  return undefined;
}

function readStyles(xml: string, theme: Map<string, string>): { styles: Map<string, StyleDef>; defaults: StyleDef } {
  const doc = parseXml(xml);
  const styles = new Map<string, StyleDef>();
  let defaults: StyleDef = {};
  for (const node of doc.getElementsByTagName("*")) {
    if (node.localName === "docDefaults") {
      defaults = mergeStyle(
        readRPr(first(first(node, "rPrDefault"), "rPr"), theme),
        readPPr(first(first(node, "pPrDefault"), "pPr")),
      );
    }
    if (node.localName !== "style") continue;
    const id = attr(node, "styleId");
    if (!id) continue;
    styles.set(id, {
      basedOn: attr(first(node, "basedOn"), "val") ?? undefined,
      ...readRPr(first(node, "rPr"), theme),
      ...readPPr(first(node, "pPr")),
      headerFill: headerFillOf(node),
    });
  }
  return { styles, defaults };
}

function resolveStyle(id: string, styles: Map<string, StyleDef>, seen = new Set<string>()): StyleDef {
  if (!id || seen.has(id)) return {};
  const style = styles.get(id);
  if (!style) return {};
  seen.add(id);
  const base = style.basedOn ? resolveStyle(style.basedOn, styles, seen) : {};
  return mergeStyle(base, style);
}

function alignment(value?: string): PdfAlign | undefined {
  if (value === "center") return "center";
  if (value === "right" || value === "end") return "right";
  return undefined;
}

function toCell(style: StyleDef): Partial<PdfCell> {
  const cell: Partial<PdfCell> = {};
  if (style.bold) cell.bold = true;
  if (style.italic) cell.italic = true;
  if (style.underline) cell.underline = true;
  if (style.size && style.size > 0) cell.fontPt = style.size / 2;
  if (style.color) cell.colorHex = style.color;
  if (style.fontFamily) cell.fontFamily = style.fontFamily;
  if (style.fill) cell.fill = style.fill;
  const align = alignment(style.align);
  if (align) cell.align = align;
  if (style.before != null) cell.spaceBefore = twipToPx(style.before);
  if (style.after != null) cell.spaceAfter = twipToPx(style.after);
  if (style.indent) cell.indent = twipToPx(style.indent);
  if (style.firstIndent) cell.firstIndent = twipToPx(style.firstIndent);
  if (style.line && style.line > 0) {
    const font = fontPx(style.size);
    cell.linePx = style.lineRule === "exact" || style.lineRule === "atLeast"
      ? Math.max(font, twipToPx(style.line))
      : Math.max(1, Math.round(font * style.line / 240));
  }
  return cell;
}

function cellStyle(p: Element, styles: Map<string, StyleDef>, defaults: StyleDef, theme: Map<string, string>): Partial<PdfCell> {
  const pPr = first(p, "pPr");
  const named = resolveStyle(attr(first(pPr, "pStyle"), "val") || "", styles);
  const run = [...p.children].find((child) => child.localName === "r") ?? null;
  return toCell(mergeStyle(
    mergeStyle(mergeStyle(mergeStyle(defaults, named), readPPr(pPr)), readRPr(first(pPr, "rPr"), theme)),
    readRPr(first(run, "rPr"), theme),
  ));
}

const EMU_PER_INCH = 914400;

function emuToPx(emu: number, min = 1): number {
  return Math.max(min, Math.round(emu / EMU_PER_INCH * 72 * PDF_PAPER_PX / PDF_PAGE_PT.w));
}

function anchorBehind(node: Element): { x: number; y: number } | null {
  const anchor = [...node.getElementsByTagName("*")].find((element) => element.localName === "anchor");
  if (!anchor || anchor.getAttribute("behindDoc") !== "1") return null;
  const offset = (name: string) => {
    const position = [...anchor.children].find((element) => element.localName === name);
    const value = Number([...position?.children ?? []].find((element) => element.localName === "posOffset")?.textContent);
    return emuToPx(Number.isFinite(value) ? value : 0, Number.NEGATIVE_INFINITY);
  };
  return { x: offset("positionH"), y: offset("positionV") };
}

function mimeOf(path: string): string | null {
  const ext = path.split(".").pop()?.toLowerCase();
  if (ext === "png") return "image/png";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "gif") return "image/gif";
  if (ext === "bmp") return "image/bmp";
  if (ext === "webp") return "image/webp";
  return null;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const size = 0x8000;
  for (let index = 0; index < bytes.length; index += size) {
    binary += String.fromCharCode(...bytes.subarray(index, Math.min(index + size, bytes.length)));
  }
  return btoa(binary);
}

function resolveZipPath(baseDir: string, target: string): string {
  const decoded = decodeURIComponent(target.replace(/\\/g, "/"));
  if (decoded.startsWith("/")) return decoded.replace(/^\/+/, "");
  const parts = `${baseDir}/${decoded}`.split("/");
  const stack: string[] = [];
  for (const part of parts) {
    if (part === "..") stack.pop();
    else if (part && part !== ".") stack.push(part);
  }
  return stack.join("/");
}

function readRels(xml: string): Map<string, string> {
  const rels = new Map<string, string>();
  for (const node of parseXml(xml).getElementsByTagName("*")) {
    if (node.localName !== "Relationship") continue;
    const id = node.getAttribute("Id");
    const target = node.getAttribute("Target");
    if (id && target) rels.set(id, target);
  }
  return rels;
}

function relLocal(element: Element, name: string): string | null {
  for (const item of element.attributes) {
    if (item.localName === name) return item.value;
  }
  return null;
}

function blipId(node: Element): string | null {
  for (const element of node.getElementsByTagName("*")) {
    if (element.localName === "blip") return relLocal(element, "embed");
    if (element.localName === "imagedata") return relLocal(element, "id");
  }
  return null;
}

function drawingSize(node: Element): { width: number; height: number } | undefined {
  for (const element of node.getElementsByTagName("*")) {
    if (element.localName !== "extent") continue;
    const cx = Number(element.getAttribute("cx"));
    const cy = Number(element.getAttribute("cy"));
    if (cx > 0 && cy > 0) return { width: emuToPx(cx), height: emuToPx(cy) };
  }
  for (const element of node.getElementsByTagName("*")) {
    if (element.localName !== "shape") continue;
    const style = element.getAttribute("style") || "";
    const width = Number(style.match(/width:\s*([\d.]+)pt/)?.[1]);
    const height = Number(style.match(/height:\s*([\d.]+)pt/)?.[1]);
    if (width > 0 && height > 0) {
      return {
        width: Math.round(width * PDF_PAPER_PX / PDF_PAGE_PT.w),
        height: Math.round(height * PDF_PAPER_PX / PDF_PAGE_PT.w),
      };
    }
  }
  return undefined;
}

type PictureLookup = (relId: string) => Promise<PdfPicture | null>;

async function makeLookup(zip: JSZip, relXml: string | undefined, baseDir: string): Promise<PictureLookup> {
  const rels = relXml ? readRels(relXml) : new Map<string, string>();
  const cache = new Map<string, PdfPicture | null>();
  return async (relId: string) => {
    const target = rels.get(relId);
    if (!target || target.startsWith("http")) return null;
    const path = resolveZipPath(baseDir, target);
    if (cache.has(path)) return cache.get(path) ?? null;
    const mime = mimeOf(path);
    const file = zip.file(path);
    if (!mime || !file) {
      cache.set(path, null);
      return null;
    }
    const bytes = await file.async("uint8array");
    const picture = { src: `data:${mime};base64,${bytesToBase64(bytes)}`, width: 160, height: 90 };
    cache.set(path, picture);
    return picture;
  };
}

/** 有正式图形时，备用的 VML 文本框是同一段页码，不能再读一遍。 */
function inChosenFallback(node: Element): boolean {
  let current: Element | null = node;
  let fallback = false;
  while (current) {
    if (current.localName === "Fallback") fallback = true;
    if (current.localName === "AlternateContent") {
      if (!fallback) return false;
      return [...current.children].some((child) => child.localName === "Choice");
    }
    current = current.parentElement;
  }
  return false;
}

function textBoxes(p: Element): Element[] {
  const boxes: Element[] = [];
  for (const node of p.getElementsByTagName("*")) {
    if (node.localName !== "txbxContent") continue;
    if (inChosenFallback(node)) continue;
    let parent = node.parentElement;
    let nested = false;
    while (parent && parent !== p) {
      if (parent.localName === "txbxContent") nested = true;
      parent = parent.parentElement;
    }
    if (nested) continue;
    boxes.push(node);
  }
  return boxes;
}

async function readParagraphBlocks(
  p: Element,
  styles: Map<string, StyleDef>,
  defaults: StyleDef,
  theme: Map<string, string>,
  pictures: PictureLookup,
  backdrops: PdfBackdrop[] | null,
): Promise<PdfBlock[]> {
  const style = cellStyle(p, styles, defaults, theme);
  const blocks: PdfBlock[] = [];
  let text = "";
  let field = "";
  let mode: "text" | "instr" | "result" = "text";
  const flush = () => {
    const keep = text.trim().length > 0 || text.includes(PDF_PAGE_MARK) || text.includes(PDF_PAGES_MARK);
    if (!keep) {
      text = "";
      return;
    }
    blocks.push({ id: nextId(), type: "text", text, ...style });
    text = "";
  };
  const pushImage = async (node: Element) => {
    const relId = blipId(node);
    if (!relId) return;
    const picture = await pictures(relId);
    if (!picture) return;
    const size = drawingSize(node);
    const behind = backdrops ? anchorBehind(node) : null;
    if (behind && backdrops) {
      backdrops.push({
        src: picture.src,
        x: behind.x,
        y: behind.y,
        width: size?.width ?? picture.width,
        height: size?.height ?? picture.height,
      });
      return;
    }
    flush();
    const image: PdfImageBlock = {
      id: nextId(),
      type: "image",
      src: picture.src,
      width: size?.width ?? picture.width,
      height: size?.height ?? picture.height,
    };
    blocks.push(image);
  };
  const walkRun = async (run: Element) => {
    for (const part of run.children) {
      if (part.localName === "lastRenderedPageBreak") {
        flush();
        blocks.push({ id: nextId(), type: "pageBreak" });
      } else if (part.localName === "br" && attr(part, "type") === "page") {
        flush();
        blocks.push({ id: nextId(), type: "pageBreak" });
      } else if (part.localName === "br" || part.localName === "cr") {
        if (mode === "text") text += "\n";
      } else if (part.localName === "tab") {
        if (mode === "text") text += "\t";
      } else if (part.localName === "t") {
        if (mode === "text") text += part.textContent ?? "";
      } else if (part.localName === "instrText") {
        field += part.textContent ?? "";
      } else if (part.localName === "fldChar") {
        const kind = attr(part, "fldCharType");
        if (kind === "begin") {
          mode = "instr";
          field = "";
        } else if (kind === "separate") {
          mode = "result";
          if (/\bNUMPAGES\b/.test(field)) text += PDF_PAGES_MARK;
          else if (/\bPAGE\b/.test(field)) text += PDF_PAGE_MARK;
        } else if (kind === "end") {
          mode = "text";
        }
      } else if (part.localName === "drawing" || part.localName === "pict" || part.localName === "object") {
        await pushImage(part);
      }
    }
  };
  for (const child of p.children) {
    if (child.localName === "r") await walkRun(child);
    else if (child.localName === "hyperlink" || child.localName === "ins" || child.localName === "smartTag") {
      for (const run of child.children) {
        if (run.localName === "r") await walkRun(run);
      }
    } else if (child.localName === "drawing" || child.localName === "pict") {
      await pushImage(child);
    }
  }
  flush();
  return blocks;
}

function tableHeaderFill(table: Element, styles: Map<string, StyleDef>): string | undefined {
  let id = attr(first(first(table, "tblPr"), "tblStyle"), "val") || "";
  const seen = new Set<string>();
  while (id && !seen.has(id)) {
    seen.add(id);
    const style = styles.get(id);
    if (!style) return undefined;
    if (style.headerFill) return style.headerFill;
    id = style.basedOn || "";
  }
  return undefined;
}

async function readTable(table: Element, styles: Map<string, StyleDef>, defaults: StyleDef, theme: Map<string, string>, pictures: PictureLookup, backdrops: PdfBackdrop[] | null): Promise<PdfTableBlock> {
  const grid = [...(first(table, "tblGrid")?.children ?? [])]
    .filter((col) => col.localName === "gridCol")
    .map((col) => Number(attr(col, "w")) || 0);
  const headerFill = tableHeaderFill(table, styles);
  const rows: PdfCell[][] = [];
  for (const row of [...table.children].filter((child) => child.localName === "tr")) {
    const cells: PdfCell[] = [];
    const rowIndex = rows.length;
    for (const cell of [...row.children].filter((child) => child.localName === "tc")) {
      const paragraphs = [...cell.children].filter((child) => child.localName === "p");
      const pieces: PdfBlock[] = [];
      for (const paragraph of paragraphs) pieces.push(...await readParagraphBlocks(paragraph, styles, defaults, theme, pictures, backdrops));
      // 格内图先丢掉，避免行高乱掉；正文图和底板照旧。下载后再在 Word 里贴。
      const text = pieces.flatMap((piece) => piece.type === "text" ? [piece.text] : []).join("\n");
      const style = paragraphs[0] ? cellStyle(paragraphs[0], styles, defaults, theme) : {};
      const tcPr = first(cell, "tcPr");
      const fill = shadeFill(tcPr) || (rowIndex === 0 ? headerFill : undefined);
      const span = Math.max(1, Number(attr(first(tcPr, "gridSpan"), "val")) || 1);
      const vAlignRaw = attr(first(tcPr, "vAlign"), "val");
      const vAlign = vAlignRaw === "center" ? "middle" as const : vAlignRaw === "bottom" ? "bottom" as const : undefined;
      const item: PdfCell = { text, ...style, ...(fill ? { fill } : {}), ...(vAlign ? { vAlign } : {}) };
      cells.push(item, ...Array.from({ length: span - 1 }, () => ({ text: "" })));
    }
    rows.push(cells);
  }
  const width = Math.max(1, ...rows.map((row) => row.length), grid.length);
  const filled = (rows.length > 0 ? rows : [[{ text: "" }]]).map((row) => {
    const next = row.slice(0, width);
    while (next.length < width) next.push({ text: "" });
    return next;
  });
  const sum = grid.reduce((total, value) => total + value, 0);
  const colWidths = grid.length === width && sum > 0 ? grid.map((value) => value / sum) : undefined;
  return { id: nextId(), type: "table", rows: filled, ...(colWidths ? { colWidths } : {}) };
}

async function collect(parent: Element, styles: Map<string, StyleDef>, defaults: StyleDef, theme: Map<string, string>, pictures: PictureLookup, blocks: PdfBlock[], backdrops: PdfBackdrop[] | null) {
  for (const child of parent.children) {
    if (child.localName === "p") {
      blocks.push(...await readParagraphBlocks(child, styles, defaults, theme, pictures, backdrops));
      for (const box of textBoxes(child)) await collect(box, styles, defaults, theme, pictures, blocks, backdrops);
    } else if (child.localName === "tbl") {
      blocks.push(await readTable(child, styles, defaults, theme, pictures, backdrops));
    } else if (child.localName === "sdt") {
      const content = first(child, "sdtContent");
      if (content) await collect(content, styles, defaults, theme, pictures, blocks, backdrops);
    }
  }
}

function tidyBreaks(blocks: PdfBlock[]): PdfBlock[] {
  const next: PdfBlock[] = [];
  for (const block of blocks) {
    if (block.type === "pageBreak" && (next.length === 0 || next[next.length - 1].type === "pageBreak")) continue;
    next.push(block);
  }
  while (next[next.length - 1]?.type === "pageBreak") next.pop();
  return next;
}

/** 页脚文本框和它的备用图形会写出同一个页码，只留一份。 */
function pageMarkKey(block: PdfBlock): string | null {
  if (block.type !== "text") return null;
  if (!block.text.includes(PDF_PAGE_MARK) && !block.text.includes(PDF_PAGES_MARK)) return null;
  const plain = block.text.split(PDF_PAGE_MARK).join("").split(PDF_PAGES_MARK).join("").trim();
  if (plain.length > 0) return null;
  return block.text.split(PDF_PAGE_MARK).join("#").split(PDF_PAGES_MARK).join("*").replace(/\s/g, "");
}

function visibleStory(blocks: PdfBlock[]): PdfBlock[] | undefined {
  const visible = blocks.filter((block) => block.type !== "pageBreak" && (block.type !== "text" || block.text.trim().length > 0 || block.text.includes(PDF_PAGE_MARK) || block.text.includes(PDF_PAGES_MARK)));
  const seen = new Set<string>();
  const unique = visible.filter((block) => {
    const key = pageMarkKey(block);
    if (!key) return true;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return unique.length > 0 ? unique : undefined;
}

function readSection(body: Element): { headers: { type: string; id: string }[]; footers: { type: string; id: string }[]; page?: PdfPageSetup } {
  const sect = [...body.children].reverse().find((child) => child.localName === "sectPr")
    ?? [...body.getElementsByTagName("*")].reverse().find((node) => node.localName === "sectPr")
    ?? null;
  if (!sect) return { headers: [], footers: [] };
  const headers: { type: string; id: string }[] = [];
  const footers: { type: string; id: string }[] = [];
  for (const child of sect.children) {
    const id = relLocal(child, "id") || "";
    if (!id) continue;
    if (child.localName === "headerReference") headers.push({ type: attr(child, "type") || "default", id });
    if (child.localName === "footerReference") footers.push({ type: attr(child, "type") || "default", id });
  }
  const size = first(sect, "pgSz");
  const margin = first(sect, "pgMar");
  const width = rawNumber(size, "w");
  const height = rawNumber(size, "h");
  const page = width && height ? {
    width: twipToPx(width),
    height: twipToPx(height),
    marginTop: twipToPx(rawNumber(margin, "top") ?? 0),
    marginRight: twipToPx(rawNumber(margin, "right") ?? 0),
    marginBottom: twipToPx(rawNumber(margin, "bottom") ?? 0),
    marginLeft: twipToPx(rawNumber(margin, "left") ?? 0),
  } : undefined;
  return { headers, footers, page };
}

export async function importDocx(raw: string): Promise<PdfDocument> {
  const zip = await JSZip.loadAsync(latin1Bytes(raw));
  const xml = await zip.file("word/document.xml")?.async("string");
  if (!xml) throw new Error("这份 Word 里没有正文");
  const stylesXml = await zip.file("word/styles.xml")?.async("string");
  const themeXml = await zip.file("word/theme/theme1.xml")?.async("string");
  const theme = themeXml ? readTheme(themeXml) : new Map<string, string>();
  const { styles, defaults } = stylesXml ? readStyles(stylesXml, theme) : { styles: new Map<string, StyleDef>(), defaults: {} };
  const relXml = await zip.file("word/_rels/document.xml.rels")?.async("string");
  const pictures = await makeLookup(zip, relXml, "word");
  const body = [...parseXml(xml).getElementsByTagName("*")].find((node) => node.localName === "body");
  const blocks: PdfBlock[] = [];
  if (body) await collect(body, styles, defaults, theme, pictures, blocks, null);
  const story = tidyBreaks(blocks);
  const section = body ? readSection(body) : { headers: [], footers: [] };
  const rels = relXml ? readRels(relXml) : new Map<string, string>();
  const readPart = async (id: string) => {
    const target = rels.get(id);
    if (!target) return undefined;
    const path = resolveZipPath("word", target);
    const partXml = await zip.file(path)?.async("string");
    if (!partXml) return undefined;
    const root = [...parseXml(partXml).getElementsByTagName("*")].find((node) => node.localName === "hdr" || node.localName === "ftr");
    if (!root) return undefined;
    const partRels = await zip.file(path.replace(/([^/]+)$/, "_rels/$1.rels"))?.async("string");
    const partPictures = await makeLookup(zip, partRels, path.replace(/[^/]+$/, "").replace(/\/$/, ""));
    const partStory: PdfBlock[] = [];
    const backdrops: PdfBackdrop[] = [];
    await collect(root, styles, defaults, theme, partPictures, partStory, backdrops);
    return { blocks: visibleStory(partStory), backdrops: backdrops.length > 0 ? backdrops : undefined };
  };
  const findPart = (list: { type: string; id: string }[], type: string) => list.find((item) => item.type === type)?.id;
  const headerId = findPart(section.headers, "default");
  const footerId = findPart(section.footers, "default");
  const firstHeaderId = findPart(section.headers, "first");
  const firstFooterId = findPart(section.footers, "first");
  const headerPart = headerId ? await readPart(headerId) : undefined;
  const footerPart = footerId ? await readPart(footerId) : undefined;
  const firstHeaderPart = firstHeaderId ? await readPart(firstHeaderId) : undefined;
  const firstFooterPart = firstFooterId ? await readPart(firstFooterId) : undefined;
  const backdrop = [...(headerPart?.backdrops ?? []), ...(footerPart?.backdrops ?? [])];
  const firstBackdrop = [...(firstHeaderPart?.backdrops ?? []), ...(firstFooterPart?.backdrops ?? [])];
  return {
    format: PDF_FORMAT,
    version: PDF_VERSION,
    blocks: story.length > 0 ? story : [{ id: nextId(), type: "text", text: "" }],
    ...(headerPart?.blocks ? { header: headerPart.blocks } : {}),
    ...(footerPart?.blocks ? { footer: footerPart.blocks } : {}),
    ...(firstHeaderPart?.blocks ? { firstHeader: firstHeaderPart.blocks } : {}),
    ...(firstFooterPart?.blocks ? { firstFooter: firstFooterPart.blocks } : {}),
    ...(section.page ? { page: section.page } : {}),
    ...(backdrop.length > 0 ? { backdrop } : {}),
    ...(firstBackdrop.length > 0 ? { firstBackdrop } : {}),
  };
}
