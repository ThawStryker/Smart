import { describe, expect, it } from "vitest";
import {
  addPdfTableColumn,
  addPdfTableRow,
  blockHeightPx,
  columnWidths,
  createPdfDocument,
  layoutPages,
  loadPdfContent,
  patchPdfCell,
  patchPdfText,
  removePdfTableColumn,
  removePdfTableRow,
  resizePdfColumns,
  serializePdfDocument,
  updatePdfCell,
} from "./document";

describe("pdf document", () => {
  it("round-trips its own format and ignores markdown", () => {
    const doc = createPdfDocument();
    const loaded = loadPdfContent(serializePdfDocument(doc));
    expect(loaded.kind).toBe("document");
    if (loaded.kind !== "document") return;
    expect(loaded.doc.format).toBe("smart-pdf");
    expect(loaded.doc.blocks).toHaveLength(1);
    expect(loaded.doc.blocks[0]).toMatchObject({ type: "text", text: "" });
    expect(loadPdfContent("# 标题\n\n| a | b |").kind).toBe("document");
  });

  it("does not treat a binary pdf or docx as an editable template", () => {
    expect(loadPdfContent("%PDF-1.7\n").kind).toBe("binary");
    expect(loadPdfContent("PK\u0003\u0004").kind).toBe("binary");
  });

  it("does not turn a stored pdf pointer into a blank document", () => {
    const raw = JSON.stringify({
      format: "smart-pdf-file",
      version: 1,
      uri: "s3://attachments/workspace/user/file",
      encoding: "latin1",
    });
    expect(loadPdfContent(raw).kind).toBe("remote");
  });

  it("adds and removes table rows and columns", () => {
    const doc = {
      ...createPdfDocument(),
      blocks: [{
        id: "table",
        type: "table" as const,
        rows: [
          [{ text: "时长" }, { text: "教学环节" }, { text: "教师活动" }],
          [{ text: "" }, { text: "" }, { text: "" }],
        ],
      }],
    };
    const table = doc.blocks.find((block) => block.type === "table");
    if (!table || table.type !== "table") throw new Error("missing table");
    const withRow = addPdfTableRow(doc, table.id);
    const rows = withRow.blocks.find((block) => block.id === table.id);
    if (!rows || rows.type !== "table") throw new Error("missing table");
    expect(rows.rows).toHaveLength(table.rows.length + 1);

    const withCol = addPdfTableColumn(withRow, table.id);
    const cols = withCol.blocks.find((block) => block.id === table.id);
    if (!cols || cols.type !== "table") throw new Error("missing table");
    expect(cols.rows[0]).toHaveLength(table.rows[0].length + 1);

    const edited = updatePdfCell(withCol, table.id, 1, 0, "2 分钟");
    const cell = edited.blocks.find((block) => block.id === table.id);
    if (!cell || cell.type !== "table") throw new Error("missing table");
    expect(cell.rows[1][0].text).toBe("2 分钟");

    const removedRow = removePdfTableRow(edited, table.id, 1);
    const removedCol = removePdfTableColumn(removedRow, table.id, 0);
    const finalTable = removedCol.blocks.find((block) => block.id === table.id);
    if (!finalTable || finalTable.type !== "table") throw new Error("missing table");
    expect(finalTable.rows.length).toBeGreaterThan(0);
    expect(finalTable.rows[0].length).toBeGreaterThan(0);
  });

  it("keeps old string cells and stores one style per cell", () => {
    const loaded = loadPdfContent(JSON.stringify({
      format: "smart-pdf",
      version: 1,
      blocks: [{ id: "t", type: "table", rows: [["时长", "环节"]] }],
    }));
    if (loaded.kind !== "document") throw new Error("expected document");
    const table = loaded.doc.blocks[0];
    if (table.type !== "table") throw new Error("expected table");
    expect(table.rows[0][0].text).toBe("时长");

    const styled = patchPdfCell(loaded.doc, "t", 0, 0, { bold: true, align: "center", size: "lg", color: "accent" });
    const again = loadPdfContent(serializePdfDocument(styled));
    if (again.kind !== "document") throw new Error("expected document");
    const cell = again.doc.blocks[0];
    if (cell.type !== "table") throw new Error("expected table");
    expect(cell.rows[0][0]).toMatchObject({ text: "时长", bold: true, align: "center", size: "lg", color: "accent" });
    const centered = patchPdfCell(again.doc, "t", 0, 0, { vAlign: "middle" });
    const stored = loadPdfContent(serializePdfDocument(centered));
    if (stored.kind !== "document") throw new Error("expected document");
    const storedTable = stored.doc.blocks[0];
    if (storedTable.type !== "table") throw new Error("expected table");
    expect(storedTable.rows[0][0].vAlign).toBe("middle");
  });

  it("keeps text block style", () => {
    const doc = createPdfDocument();
    const text = doc.blocks.find((block) => block.type === "text");
    if (!text || text.type !== "text") throw new Error("missing text");
    const styled = patchPdfText(doc, text.id, { bold: true, align: "center", size: "lg", color: "accent" });
    const again = loadPdfContent(serializePdfDocument(styled));
    if (again.kind !== "document") throw new Error("expected document");
    const block = again.doc.blocks.find((item) => item.id === text.id);
    expect(block).toMatchObject({ type: "text", bold: true, align: "center", size: "lg", color: "accent" });
  });

  it("resizes a column by taking width from its neighbor", () => {
    expect(resizePdfColumns([0.5, 0.5], 0, 0.1)).toEqual([0.6, 0.4]);
    expect(resizePdfColumns([0.08, 0.92], 0, -1)[0]).toBeCloseTo(0.08);
    const doc = {
      ...createPdfDocument(),
      blocks: [{
        id: "table",
        type: "table" as const,
        rows: [
          [{ text: "时长" }, { text: "教学环节" }, { text: "教师活动" }],
          [{ text: "" }, { text: "" }, { text: "" }],
        ],
      }],
    };
    const table = doc.blocks.find((block) => block.type === "table");
    if (!table || table.type !== "table") throw new Error("missing table");
    const wider = addPdfTableColumn(doc, table.id);
    const next = wider.blocks.find((block) => block.id === table.id);
    if (!next || next.type !== "table") throw new Error("missing table");
    const widths = columnWidths(next);
    expect(widths).toHaveLength(table.rows[0].length + 1);
    expect(widths.reduce((sum, width) => sum + width, 0)).toBeCloseTo(1);
  });

  it("keeps a word page break and the page chrome", () => {
    const doc = createPdfDocument();
    doc.blocks = [
      { id: "a", type: "text", text: "第一页" },
      { id: "break", type: "pageBreak" },
      { id: "b", type: "text", text: "第二页" },
    ];
    doc.header = [{ id: "h", type: "text", text: "页眉" }];
    doc.footer = [{ id: "f", type: "text", text: "页脚" }];
    const loaded = loadPdfContent(serializePdfDocument(doc));
    if (loaded.kind !== "document") throw new Error("expected document");
    expect(layoutPages(loaded.doc)).toHaveLength(2);
    expect(loaded.doc.header?.[0]).toMatchObject({ type: "text", text: "页眉" });
    expect(loaded.doc.footer?.[0]).toMatchObject({ type: "text", text: "页脚" });
    const image = loadPdfContent(serializePdfDocument({
      ...createPdfDocument(),
      blocks: [{ id: "pic", type: "image", src: "data:image/png;base64,aaaa", width: 40, height: 20 }],
    }));
    if (image.kind !== "document") throw new Error("expected document");
    expect(image.doc.blocks[0]).toMatchObject({ type: "image", width: 40, height: 20 });
  });

  it("wraps a long paragraph onto more than one line", () => {
    const one = blockHeightPx({ id: "a", type: "text", text: "字" });
    const many = blockHeightPx({ id: "b", type: "text", text: "字".repeat(180) });
    expect(many).toBeGreaterThan(one + 26 * 2);
  });

  it("keeps a heading with the start of a long table", () => {
    const doc = createPdfDocument();
    doc.page = { width: 820, height: 1160, marginTop: 80, marginRight: 72, marginBottom: 80, marginLeft: 72 };
    doc.blocks = [
      { id: "title", type: "text", text: "四、教学过程", fontPt: 16, bold: true },
      {
        id: "table",
        type: "table",
        colWidths: [0.2, 0.8],
        rows: Array.from({ length: 30 }, (_, index) => [
          { text: `环节${index}`, fontPt: 12 },
          { text: "教师讲解并组织学生讨论本环节的目标、活动和评价。".repeat(6), fontPt: 12 },
        ]),
      },
    ];
    const pages = layoutPages(doc);
    expect(pages.length).toBeGreaterThan(1);
    expect(pages[0].map((block) => block.type)).toEqual(["text", "table"]);
    const first = pages[0].find((block) => block.type === "table");
    if (!first || first.type !== "table") throw new Error("missing table");
    expect(first.rows.length).toBeLessThan(30);
    const rest = pages[1]?.find((block) => block.type === "table");
    if (!rest || rest.type !== "table") throw new Error("missing continuation");
    expect(rest.rowOffset).toBe(first.rows.length);
    const shown = pages.reduce((sum, page) => sum + page.reduce((inner, block) => inner + (block.type === "table" ? block.rows.length : 0), 0), 0);
    expect(shown).toBe(30);
  });
});

describe("pdf templates", () => {
  it("applies the tongshi lesson skeleton from 教案文档", async () => {
    const { applyPdfTemplate } = await import("./templates");
    const next = applyPdfTemplate(createPdfDocument(), "tongshi");
    expect(next.backdrop?.[0]?.src.startsWith("data:image/png")).toBe(true);
    expect(next.firstBackdrop).toBeUndefined();
    const texts = next.blocks.filter((block) => block.type === "text").map((block) => block.text);
    expect(texts).toEqual(["教案文档", "一、课程内容", "", "二、教学目标", "三、教学重难点", "四、教学过程", "五、教学评价"]);
    const tables = next.blocks.filter((block) => block.type === "table");
    expect(tables.map((block) => (block.type === "table" ? block.rows[0].map((cell) => cell.text) : []))).toEqual([
      ["", "教学目标"],
      ["", "内容"],
      ["", "时长", "教学环节", "教师活动"],
      ["", "评价方式与工具"],
    ]);
    expect(tables[0]?.type === "table" ? tables[0].rows.map((row) => row[0].text) : []).toEqual(["", "认知", "技能", "思维", "价值观"]);
    expect(tables[1]?.type === "table" ? tables[1].rows.map((row) => row[0].text) : []).toEqual(["", "教学重点", "教学难点"]);
    expect(tables[3]?.type === "table" ? tables[3].rows.map((row) => row[0].text) : []).toEqual(["", "知识理解", "操作技能", "思维发展", "意识与价值观"]);
    expect(tables[0]?.type === "table" ? tables[0].rows[1][1].text : "missing").toBe("");
    expect(tables[0]?.type === "table" ? tables[0].rows[0][1].fontFamily : "").toBe("微软雅黑");
    expect(tables[0]?.type === "table" ? tables[0].rows[1][0].fontFamily : "").toBe("微软雅黑");
    const course = next.blocks.find((block) => block.type === "text" && block.text === "");
    expect(course && course.type === "text" ? course.fontFamily : "").toBe("微软雅黑");
    const process = tables[2];
    if (!process || process.type !== "table") throw new Error("missing process table");
    expect(process.colWidths).toEqual([0.143, 0.121, 0.157, 0.579]);
    expect(process.rows.every((row) => row[1].vAlign === "middle" && row[2].vAlign === "middle")).toBe(true);
    expect(tables[0]?.type === "table" ? tables[0].rows[1][1].linePx : 0).toBe(30);
    expect(tables[0]?.type === "table" ? tables[0].rows[1][0].linePx : 0).toBe(22);
    expect(process.rows[1][3].linePx).toBe(30);
  });

  it("opens older tongshi lessons with a slightly looser table body line", async () => {
    const { applyPdfTemplate } = await import("./templates");
    const next = applyPdfTemplate(createPdfDocument(), "tongshi");
    const tables = next.blocks.filter((block) => block.type === "table");
    const goals = tables[0];
    if (!goals || goals.type !== "table") throw new Error("missing goals");
    goals.rows[1][1] = { ...goals.rows[1][1], text: "1. 理解\n2. 掌握", linePx: 22 };
    const loaded = loadPdfContent(serializePdfDocument(next));
    expect(loaded.kind).toBe("document");
    if (loaded.kind !== "document") return;
    const again = loaded.doc.blocks.find((block) => block.type === "table");
    if (!again || again.type !== "table") throw new Error("missing table");
    expect(again.rows[1][1].linePx).toBe(30);
    expect(again.rows[1][0].linePx).toBe(22);
  });
});
