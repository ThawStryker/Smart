/** 按编辑页上的文字和表格生成 docx。页边距、字号和行高按纸张宽度折算。 */
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeightRule,
  HorizontalPositionRelativeFrom,
  ImageRun,
  LineRuleType,
  Packer,
  PageBreak,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  TextWrappingType,
  UnderlineType,
  VerticalAlign,
  VerticalPositionRelativeFrom,
  WidthType,
  type IBorderOptions,
} from "docx";
import {
  PDF_COLORS,
  PDF_FONT_PX,
  PDF_LAYOUT,
  PDF_PAGE_MARK,
  PDF_PAGE_PT,
  PDF_PAGES_MARK,
  PDF_PAPER_PX,
  columnWidths,
  lookLinePx,
  paperBox,
  rowBoxPx,
  type PdfAlign,
  type PdfBackdrop,
  type PdfBlock,
  type PdfCell,
  type PdfDocument,
  type PdfFontSize,
  type PdfImageBlock,
  type PdfPageSetup,
  type PdfTableBlock,
  type PdfTextBlock,
} from "./document";

const PAGE_W = Math.round(PDF_PAGE_PT.w * 20);
const PAGE_H = Math.round(PDF_PAGE_PT.h * 20);
const FONT = { ascii: "Calibri", hAnsi: "Calibri", eastAsia: "宋体" };
const LINE: IBorderOptions = { style: BorderStyle.SINGLE, size: 4, color: "BFBFBF" };
const BORDERS = { top: LINE, bottom: LINE, left: LINE, right: LINE };

function twip(px: number): number {
  return Math.round(px * PAGE_W / PDF_PAPER_PX);
}

function halfPoints(size?: PdfFontSize): number {
  return Math.max(2, Math.round(PDF_FONT_PX[size || "md"] * PDF_PAGE_PT.w / PDF_PAPER_PX * 2));
}

function alignment(value?: PdfAlign) {
  if (value === "center") return AlignmentType.CENTER;
  if (value === "right") return AlignmentType.RIGHT;
  return AlignmentType.LEFT;
}

function runSize(cell: Pick<PdfCell, "size" | "fontPt">): number {
  if (cell.fontPt && cell.fontPt > 0) return Math.max(2, Math.round(cell.fontPt * 2));
  return halfPoints(cell.size);
}

function runFont(cell: Pick<PdfCell, "fontFamily">) {
  if (!cell.fontFamily) return FONT;
  return { ascii: cell.fontFamily, hAnsi: cell.fontFamily, eastAsia: cell.fontFamily };
}

function runColor(cell: Pick<PdfCell, "color" | "colorHex">): string {
  return (cell.colorHex || PDF_COLORS[cell.color || "ink"]).replace("#", "");
}

function imageType(src: string): "jpg" | "png" | "gif" | "bmp" | null {
  if (src.startsWith("data:image/jpeg") || src.startsWith("data:image/jpg")) return "jpg";
  if (src.startsWith("data:image/png")) return "png";
  if (src.startsWith("data:image/gif")) return "gif";
  if (src.startsWith("data:image/bmp")) return "bmp";
  return null;
}

function imagePx(px: number): number {
  return Math.max(1, Math.round(px * PDF_PAGE_PT.w / PDF_PAPER_PX * 96 / 72));
}

function pxToEmu(px: number): number {
  return Math.round(px * PDF_PAGE_PT.w / PDF_PAPER_PX / 72 * 914400);
}

function backdropParagraphs(items: PdfBackdrop[] | undefined): Paragraph[] {
  return (items ?? []).flatMap((item) => {
    const type = imageType(item.src);
    if (!type) return [];
    return [new Paragraph({
      children: [new ImageRun({
        type,
        data: item.src,
        transformation: { width: imagePx(item.width), height: imagePx(item.height) },
        floating: {
          horizontalPosition: { relative: HorizontalPositionRelativeFrom.PAGE, offset: pxToEmu(item.x) },
          verticalPosition: { relative: VerticalPositionRelativeFrom.PAGE, offset: pxToEmu(item.y) },
          behindDocument: true,
          allowOverlap: true,
          wrap: { type: TextWrappingType.NONE },
        },
      })],
    })];
  });
}

function runOptions(cell: PdfCell) {
  return {
    bold: !!cell.bold,
    italics: cell.italic || undefined,
    underline: cell.underline ? { type: UnderlineType.SINGLE } : undefined,
    size: runSize(cell),
    font: runFont(cell),
    color: runColor(cell),
  };
}

function runs(text: string, cell: PdfCell): TextRun[] {
  const pieces = text.split(/(\u0001PAGE\u0001|\u0001PAGES\u0001)/);
  const children: TextRun[] = [];
  pieces.forEach((piece) => {
    if (!piece) return;
    if (piece === PDF_PAGE_MARK || piece === PDF_PAGES_MARK) {
      children.push(new TextRun({
        ...runOptions(cell),
        children: [piece === PDF_PAGE_MARK ? PageNumber.CURRENT : PageNumber.TOTAL_PAGES],
      }));
      return;
    }
    piece.split("\n").forEach((line, index) => {
      children.push(new TextRun({
        ...runOptions(cell),
        text: line,
        break: index === 0 ? undefined : 1,
      }));
    });
  });
  return children.length > 0 ? children : [new TextRun("")];
}

function imageParagraph(block: PdfImageBlock): Paragraph | null {
  const type = imageType(block.src);
  if (!type) return null;
  return new Paragraph({
    children: [new ImageRun({
      type,
      data: block.src,
      transformation: { width: imagePx(block.width), height: imagePx(block.height) },
    })],
  });
}

function paragraph(cell: PdfCell, after: number): Paragraph {
  return new Paragraph({
    alignment: alignment(cell.align),
    spacing: {
      before: cell.spaceBefore != null ? twip(cell.spaceBefore) : 0,
      after: cell.spaceAfter != null ? twip(cell.spaceAfter) : after,
      line: twip(lookLinePx(cell)),
      lineRule: LineRuleType.EXACT,
    },
    indent: cell.indent || cell.firstIndent ? {
      left: cell.indent ? twip(cell.indent) : undefined,
      firstLine: cell.firstIndent && cell.firstIndent > 0 ? twip(cell.firstIndent) : undefined,
      hanging: cell.firstIndent && cell.firstIndent < 0 ? twip(-cell.firstIndent) : undefined,
    } : undefined,
    children: runs(cell.text, cell),
  });
}

function textBlock(block: PdfTextBlock, gap: number): Paragraph {
  return paragraph(block, gap);
}

/** 表格宽度跟页面版心走，不能写死默认 48px 页边。通识教案左右是 74，旧算法会让表往右溢出。 */
function pageContentWidthTwip(page?: PdfPageSetup): number {
  const setup = pageSetup(page);
  return Math.max(twip(80), setup.size.width - setup.margin.left - setup.margin.right);
}

function tableBlock(block: PdfTableBlock, page?: PdfPageSetup): Table {
  const tableWidth = pageContentWidthTwip(page);
  const widths = columnWidths(block).map((ratio) => Math.round(ratio * tableWidth));
  widths[widths.length - 1] += tableWidth - widths.reduce((sum, width) => sum + width, 0);
  const padX = twip(PDF_LAYOUT.cellPadX);
  const padY = twip(PDF_LAYOUT.cellPadY);
  return new Table({
    width: { size: tableWidth, type: WidthType.DXA },
    columnWidths: widths,
    rows: block.rows.map((row, rowIndex) => {
      const lines = row.map((cell) => Math.max(1, cell.text.split("\n").length));
      return new TableRow({
        height: { value: twip(rowBoxPx(row, lines, block.rowMinHeights?.[rowIndex] ?? 0)), rule: HeightRule.ATLEAST },
        children: row.map((cell, colIndex) => new TableCell({
          width: { size: widths[colIndex], type: WidthType.DXA },
          margins: { top: padY, bottom: padY, left: padX, right: padX },
          verticalAlign: cell.vAlign === "middle" ? VerticalAlign.CENTER : cell.vAlign === "bottom" ? VerticalAlign.BOTTOM : VerticalAlign.TOP,
          borders: BORDERS,
          shading: cell.fill ? { type: ShadingType.CLEAR, fill: cell.fill.replace("#", "") } : undefined,
          children: [
            paragraph(cell, 0),
            ...(cell.pictures ?? []).flatMap((picture) => {
              const drawn = imageParagraph({ ...picture, id: "cell", type: "image" });
              return drawn ? [drawn] : [];
            }),
          ],
        })),
      });
    }),
  });
}

function gapParagraph(): Paragraph {
  return new Paragraph({
    spacing: { before: 0, after: 0, line: twip(PDF_LAYOUT.blockGap), lineRule: LineRuleType.EXACT },
    children: [new TextRun("")],
  });
}

function storyChildren(blocks: PdfBlock[] | undefined, page?: PdfPageSetup): (Paragraph | Table)[] {
  const children: (Paragraph | Table)[] = [];
  for (const block of blocks ?? []) {
    if (block.type === "image") {
      const drawn = imageParagraph(block);
      if (drawn) children.push(drawn);
    } else if (block.type === "text") children.push(paragraph(block, 0));
    else if (block.type === "table") children.push(tableBlock(block, page));
  }
  return children;
}

function pageSetup(page: PdfPageSetup | undefined) {
  const box = paperBox({ page });
  return {
    size: { width: page ? twip(box.width) : PAGE_W, height: page ? twip(box.height) : PAGE_H },
    margin: {
      top: twip(page?.marginTop ?? PDF_LAYOUT.bodyTop),
      bottom: twip(page?.marginBottom ?? PDF_LAYOUT.bodyBottom),
      left: twip(page?.marginLeft ?? PDF_LAYOUT.bodyX),
      right: twip(page?.marginRight ?? PDF_LAYOUT.bodyX),
    },
  };
}

export async function exportDocxDocument(doc: PdfDocument): Promise<Blob> {
  const children: (Paragraph | Table)[] = [];
  doc.blocks.forEach((block, index) => {
    const last = index === doc.blocks.length - 1;
    if (block.type === "pageBreak") {
      children.push(new Paragraph({ children: [new PageBreak()] }));
      return;
    }
    if (block.type === "image") {
      const drawn = imageParagraph(block);
      if (drawn) children.push(drawn);
      return;
    }
    if (block.type === "text") {
      children.push(textBlock(block, last ? 0 : twip(PDF_LAYOUT.blockGap)));
      return;
    }
    children.push(tableBlock(block, doc.page));
    if (!last) children.push(gapParagraph());
  });
  const header = [...backdropParagraphs(doc.backdrop), ...storyChildren(doc.header, doc.page)];
  const footer = storyChildren(doc.footer, doc.page);
  const firstHeader = [...backdropParagraphs(doc.firstBackdrop), ...storyChildren(doc.firstHeader, doc.page)];
  const firstFooter = storyChildren(doc.firstFooter, doc.page);
  const file = new Document({
    sections: [{
      properties: {
        titlePage: Boolean(doc.firstHeader?.length || doc.firstFooter?.length || doc.firstBackdrop?.length),
        page: pageSetup(doc.page),
      },
      headers: {
        ...(header.length > 0 ? { default: new Header({ children: header }) } : {}),
        ...(firstHeader.length > 0 ? { first: new Header({ children: firstHeader }) } : {}),
      },
      footers: {
        ...(footer.length > 0 ? { default: new Footer({ children: footer }) } : {}),
        ...(firstFooter.length > 0 ? { first: new Footer({ children: firstFooter }) } : {}),
      },
      children: children.length > 0 ? children : [new Paragraph("")],
    }],
  });
  return Packer.toBlob(file);
}
