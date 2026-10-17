/** 从「教案文档」抽出的通识课教案模板：底板、标题层级、表格框和表头/首列文字。 */

import {
  PDF_FORMAT,
  PDF_PAGE_MARK,
  PDF_VERSION,
  type PdfAlign,
  type PdfCell,
  type PdfDocument,
  type PdfTableBlock,
  type PdfTextBlock,
  type PdfVAlign,
} from "./document";
import { TONGSHI_BACKDROP_SRC } from "./templates/tongshi-backdrop";

export type PdfTemplateId = "tongshi";

export interface PdfTemplate {
  id: PdfTemplateId;
  title: string;
  thumb: string;
}

export const PDF_TEMPLATES: PdfTemplate[] = [
  { id: "tongshi", title: "通识课教案", thumb: TONGSHI_BACKDROP_SRC },
];

function nextId(): string {
  return `t_${Math.random().toString(36).slice(2, 10)}`;
}

function textBlock(
  text: string,
  style: {
    align?: PdfAlign;
    bold?: boolean;
    colorHex: string;
    fontFamily: string;
    fontPt: number;
    linePx: number;
    spaceAfter: number;
    spaceBefore: number;
  },
): PdfTextBlock {
  return { id: nextId(), type: "text", text, ...style };
}

function cell(
  text: string,
  style: {
    align?: PdfAlign;
    bold?: boolean;
    colorHex?: string;
    fill?: string;
    fontFamily?: string;
    fontPt?: number;
    linePx?: number;
    vAlign?: PdfVAlign;
  } = {},
): PdfCell {
  return { text, ...style };
}

const TITLE = {
  align: "center" as const,
  bold: true,
  colorHex: "#006920",
  fontFamily: "Hiragino Sans GB",
  fontPt: 18,
  linePx: 23,
  spaceAfter: 12,
  spaceBefore: 29,
};

const HEADING = {
  bold: true,
  colorHex: "#006920",
  fontFamily: "Hiragino Sans GB",
  fontPt: 13.5,
  linePx: 18,
  spaceAfter: 12,
  spaceBefore: 29,
};

const COURSE = {
  colorHex: "#5f5f5f",
  fontFamily: "微软雅黑",
  fontPt: 12,
  linePx: 22,
  spaceAfter: 0,
  spaceBefore: 0,
};

const HEAD = {
  align: "center" as const,
  bold: true,
  colorHex: "#5f5f5f",
  fill: "#ecf9f0",
  fontFamily: "微软雅黑",
  fontPt: 12,
  linePx: 17,
  vAlign: "middle" as const,
};

const HEAD_BLANK = {
  align: "center" as const,
  fill: "#ecf9f0",
  fontFamily: "微软雅黑",
  fontPt: 12,
  vAlign: "middle" as const,
};

const LABEL = {
  align: "center" as const,
  colorHex: "#5f5f5f",
  fontFamily: "微软雅黑",
  fontPt: 12,
  linePx: 22,
  vAlign: "middle" as const,
};

const BODY = {
  colorHex: "#5f5f5f",
  fontFamily: "微软雅黑",
  fontPt: 12,
  linePx: 30,
};

function table(colWidths: number[], rows: PdfCell[][]): PdfTableBlock {
  return { id: nextId(), type: "table", colWidths, rows };
}

function labeledRows(labels: string[], columns: number): PdfCell[][] {
  return labels.map((label) => {
    const row = [cell(label, LABEL)];
    while (row.length < columns) row.push(cell("", BODY));
    return row;
  });
}

function processRows(count: number): PdfCell[][] {
  const mid = { ...BODY, align: "center" as const, vAlign: "middle" as const };
  return Array.from({ length: count }, () => [cell("", LABEL), cell("", mid), cell("", mid), cell("", BODY)]);
}

/** 通识课教案：大标题「教案文档」、五个章节标题、四张表（表头和首列已填）。 */
export function createTongshiLessonTemplate(): PdfDocument {
  return {
    format: PDF_FORMAT,
    version: PDF_VERSION,
    page: {
      width: 820,
      height: 1160,
      marginTop: 99,
      marginRight: 74,
      marginBottom: 99,
      marginLeft: 74,
    },
    backdrop: [{ src: TONGSHI_BACKDROP_SRC, x: 0, y: 0, width: 820, height: 1159 }],
    footer: [
      textBlock(PDF_PAGE_MARK, {
        align: "right",
        colorHex: "#808080",
        fontFamily: "微软雅黑",
        fontPt: 12,
        linePx: 17,
        spaceAfter: 0,
        spaceBefore: 0,
      }),
    ],
    blocks: [
      textBlock("教案文档", TITLE),
      textBlock("一、课程内容", HEADING),
      textBlock("", COURSE),
      textBlock("二、教学目标", HEADING),
      table(
        [0.171, 0.829],
        [
          [cell("", HEAD_BLANK), cell("教学目标", HEAD)],
          ...labeledRows(["认知", "技能", "思维", "价值观"], 2),
        ],
      ),
      textBlock("三、教学重难点", HEADING),
      table(
        [0.149, 0.851],
        [
          [cell("", HEAD_BLANK), cell("内容", HEAD)],
          ...labeledRows(["教学重点", "教学难点"], 2),
        ],
      ),
      textBlock("四、教学过程", HEADING),
      table(
        [0.143, 0.121, 0.157, 0.579],
        [
          [cell("", HEAD_BLANK), cell("时长", HEAD), cell("教学环节", HEAD), cell("教师活动", HEAD)],
          ...processRows(6),
        ],
      ),
      textBlock("五、教学评价", HEADING),
      table(
        [0.2, 0.8],
        [
          [cell("", HEAD_BLANK), cell("评价方式与工具", HEAD)],
          ...labeledRows(["知识理解", "操作技能", "思维发展", "意识与价值观"], 2),
        ],
      ),
    ],
  };
}

/** 套用模板会换成该模板的整页结构和底板，原来的正文不保留。 */
export function applyPdfTemplate(_doc: PdfDocument, id: PdfTemplateId): PdfDocument {
  if (id === "tongshi") return createTongshiLessonTemplate();
  return _doc;
}
