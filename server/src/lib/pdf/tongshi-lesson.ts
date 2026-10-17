/** 通识课教案：把写教案 skill 的 markdown 套进与编辑器相同的模板（底板、标题、四张表）。 */

import { TONGSHI_BACKDROP_SRC } from "./tongshi-backdrop";

const PDF_FORMAT = "smart-pdf";
const PDF_VERSION = 1;
const PDF_PAGE_MARK = "\u0001PAGE\u0001";

type Align = "left" | "center" | "right";
type VAlign = "top" | "middle" | "bottom";

interface Cell {
  text: string;
  bold?: boolean;
  align?: Align;
  vAlign?: VAlign;
  colorHex?: string;
  fill?: string;
  fontFamily?: string;
  fontPt?: number;
  linePx?: number;
}

interface TextBlock extends Cell {
  id: string;
  type: "text";
  spaceAfter?: number;
  spaceBefore?: number;
}

interface TableBlock {
  id: string;
  type: "table";
  rows: Cell[][];
  colWidths?: number[];
}

type Block = TextBlock | TableBlock;

interface LessonDoc {
  format: typeof PDF_FORMAT;
  version: typeof PDF_VERSION;
  blocks: Block[];
  footer?: Block[];
  page?: {
    width: number;
    height: number;
    marginTop: number;
    marginRight: number;
    marginBottom: number;
    marginLeft: number;
  };
  backdrop?: Array<{ src: string; x: number; y: number; width: number; height: number }>;
}

function nextId(): string {
  return `t_${Math.random().toString(36).slice(2, 10)}`;
}

function textBlock(text: string, style: Omit<TextBlock, "id" | "type" | "text">): TextBlock {
  return { id: nextId(), type: "text", text, ...style };
}

function cell(text: string, style: Omit<Cell, "text"> = {}): Cell {
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

const MID = { ...BODY, align: "center" as const, vAlign: "middle" as const };

function table(colWidths: number[], rows: Cell[][]): TableBlock {
  return { id: nextId(), type: "table", colWidths, rows };
}

function labeledRows(labels: string[], columns: number): Cell[][] {
  return labels.map((label) => {
    const row = [cell(label, LABEL)];
    while (row.length < columns) row.push(cell("", BODY));
    return row;
  });
}

function processRows(count: number): Cell[][] {
  return Array.from({ length: count }, () => [cell("", LABEL), cell("", MID), cell("", MID), cell("", BODY)]);
}

/** 与编辑器「通识课教案」同一骨架。 */
export function createTongshiLessonTemplate(): LessonDoc {
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

export function isSmartPdfJson(raw: string): boolean {
  const text = raw.trim();
  if (!text.startsWith("{")) return false;
  try {
    const data = JSON.parse(text) as { format?: string; blocks?: unknown };
    return data.format === PDF_FORMAT && Array.isArray(data.blocks);
  } catch {
    return false;
  }
}

export function looksLikeLessonMarkdown(raw: string): boolean {
  return /一、课程内容/.test(raw) && /二、教学目标/.test(raw);
}

function tidyCell(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/&nbsp;/gi, " ")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/`+/g, "")
    .replace(/^\s*\*\*|\*\*\s*$/g, "")
    .trim();
}

function splitSections(md: string): Record<string, string> {
  const titles = ["教案文档", "一、课程内容", "二、教学目标", "三、教学重难点", "四、教学过程", "五、教学评价"];
  const found: Array<{ key: string; index: number; end: number }> = [];
  for (const key of titles) {
    const re = new RegExp(`^#{0,6}\\s*\\*{0,2}${key.replace(/[、]/g, "、")}\\*{0,2}\\s*$`, "m");
    const match = re.exec(md);
    if (match && match.index >= 0) found.push({ key, index: match.index, end: match.index + match[0].length });
  }
  found.sort((a, b) => a.index - b.index);
  const sections: Record<string, string> = {};
  found.forEach((item, i) => {
    const until = found[i + 1]?.index ?? md.length;
    sections[item.key] = md.slice(item.end, until).trim();
  });
  return sections;
}

function parseTable(section: string): string[][] {
  const rows: string[][] = [];
  for (const line of section.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) continue;
    if (/^\|[\s:|\-]+\|$/.test(trimmed) || /^-{3,}$/.test(trimmed.replace(/\|/g, "").trim())) continue;
    const parts = trimmed.split("|").slice(1, trimmed.endsWith("|") ? -1 : undefined).map((part) => tidyCell(part));
    if (parts.length === 0) continue;
    rows.push(parts);
  }
  return rows;
}

function firstLine(section: string): string {
  for (const line of section.split("\n")) {
    const text = tidyCell(line.replace(/^#{1,6}\s*/, ""));
    if (!text || text.startsWith("|")) continue;
    return text;
  }
  return "";
}

/** 重难点格子写成 1. 2. 3. 有序列表。模型若只空行分段，这里补编号。 */
function asOrderedList(text: string): string {
  const parts = text.split(/\n+/).map((line) => line.trim()).filter(Boolean).map((line) =>
    line.replace(/^(?:\d+[\.、．)]\s*|[①②③④⑤⑥⑦⑧⑨⑩]\s*)/, "").trim(),
  ).filter(Boolean);
  if (parts.length === 0) return "";
  return parts.map((item, index) => `${index + 1}. ${item}`).join("\n");
}

function fillLabeled(table: TableBlock, rows: string[][], labels: string[], orderedLabels: string[] = []) {
  const byLabel = new Map<string, string>();
  for (const row of rows) {
    const first = row[0] || "";
    const label = labels.find((item) => first === item || first.includes(item));
    if (!label) continue;
    byLabel.set(label, row.slice(1).filter(Boolean).join("\n"));
  }
  for (const row of table.rows) {
    const label = row[0]?.text;
    if (!label || !byLabel.has(label) || !row[1]) continue;
    const value = byLabel.get(label) || "";
    row[1].text = orderedLabels.includes(label) ? asOrderedList(value) : value;
  }
}

function fillProcess(table: TableBlock, rows: string[][]) {
  const data = rows.filter((row) => !row.some((cell) => cell === "时长" || cell === "教学环节" || cell === "教师活动"));
  const mapped = data.map((row) => {
    if (row.length >= 4) return [row[0], row[1], row[2], row.slice(3).join("\n")];
    if (row.length === 3) return ["", row[0], row[1], row[2]];
    if (row.length === 2) return ["", "", row[0], row[1]];
    return ["", "", "", row[0] || ""];
  });
  const count = Math.max(6, mapped.length);
  table.rows = [
    table.rows[0],
    ...Array.from({ length: count }, (_, index) => {
      const src = mapped[index] || ["", "", "", ""];
      return [cell(src[0], LABEL), cell(src[1], MID), cell(src[2], MID), cell(src[3], BODY)];
    }),
  ];
}

function tableAfter(blocks: Block[], heading: string): TableBlock | undefined {
  const index = blocks.findIndex((block) => block.type === "text" && block.text === heading);
  if (index < 0) return undefined;
  const next = blocks[index + 1];
  return next && next.type === "table" ? next : undefined;
}

function textAfter(blocks: Block[], heading: string): TextBlock | undefined {
  const index = blocks.findIndex((block) => block.type === "text" && block.text === heading);
  if (index < 0) return undefined;
  const next = blocks[index + 1];
  return next && next.type === "text" ? next : undefined;
}

/** 把教案 markdown 填进通识课教案模板，返回 smart-pdf JSON。 */
export function fillTongshiLessonFromMarkdown(md: string): string {
  const doc = createTongshiLessonTemplate();
  const sections = splitSections(md);
  const course = textAfter(doc.blocks, "一、课程内容");
  if (course) course.text = firstLine(sections["一、课程内容"] || "");
  const goals = tableAfter(doc.blocks, "二、教学目标");
  if (goals) fillLabeled(goals, parseTable(sections["二、教学目标"] || ""), ["认知", "技能", "思维", "价值观"]);
  const points = tableAfter(doc.blocks, "三、教学重难点");
  if (points) fillLabeled(points, parseTable(sections["三、教学重难点"] || ""), ["教学重点", "教学难点"], ["教学重点", "教学难点"]);
  const process = tableAfter(doc.blocks, "四、教学过程");
  if (process) fillProcess(process, parseTable(sections["四、教学过程"] || ""));
  const review = tableAfter(doc.blocks, "五、教学评价");
  if (review) fillLabeled(review, parseTable(sections["五、教学评价"] || ""), ["知识理解", "操作技能", "思维发展", "意识与价值观"]);
  return JSON.stringify(doc);
}

/** 教案 skill 写出的 .docx：markdown 套模板；已经是 smart-pdf 或 Word 压缩包则原样保存。 */
export function maybeWrapTongshiLessonDocx(
  displayPath: string,
  content: string,
  loadedSkills: Record<string, string>,
): string {
  if (!displayPath.toLowerCase().endsWith(".docx")) return content;
  if (isSmartPdfJson(content) || content.startsWith("PK")) return content;
  const skillOn = Object.keys(loadedSkills).some((name) => name.includes("lesson-plan"));
  if (!skillOn && !looksLikeLessonMarkdown(content)) return content;
  return fillTongshiLessonFromMarkdown(content);
}
