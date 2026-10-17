import { Document, Footer, Header, HorizontalPositionRelativeFrom, ImageRun, Packer, PageBreak, Paragraph, Table, TableCell, TableRow, TextRun, TextWrappingType, VerticalAlign, VerticalPositionRelativeFrom, WidthType } from "docx";
import { describe, expect, it } from "vitest";
import { createPdfDocument, patchPdfText } from "./document";
import { exportDocxDocument } from "./export-docx";
import { importDocx } from "./import-docx";

async function blobToLatin1(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  }));
  let text = "";
  const size = 0x8000;
  for (let index = 0; index < bytes.length; index += size) {
    text += String.fromCharCode(...bytes.subarray(index, Math.min(index + size, bytes.length)));
  }
  return text;
}

describe("docx import", () => {
  it("opens paragraphs and tables from an uploaded docx", async () => {
    const doc = {
      ...createPdfDocument(),
      blocks: [
        { id: "title", type: "text" as const, text: "课时标题" },
        {
          id: "table",
          type: "table" as const,
          rows: [
            [{ text: "时长" }, { text: "教学环节" }, { text: "教师活动" }],
            [{ text: "" }, { text: "" }, { text: "" }],
          ],
        },
      ],
    };
    const text = doc.blocks.find((block) => block.type === "text");
    if (!text || text.type !== "text") throw new Error("missing text");
    const styled = patchPdfText(doc, text.id, { bold: true, align: "center", size: "lg", color: "accent", text: "课时标题" });
    const imported = await importDocx(await blobToLatin1(await exportDocxDocument(styled)));
    const title = imported.blocks.find((block) => block.type === "text");
    const table = imported.blocks.find((block) => block.type === "table");
    expect(title).toMatchObject({
      type: "text",
      text: "课时标题",
      bold: true,
      align: "center",
      fontPt: 13,
      colorHex: "#4338ca",
      fontFamily: "宋体",
    });
    if (!table || table.type !== "table") throw new Error("missing table");
    expect(table.rows[0].map((cell) => cell.text)).toEqual(["时长", "教学环节", "教师活动"]);
  });

  it("reads images, headers, footers, and page breaks", async () => {
    const png = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="), (char) => char.charCodeAt(0));
    const file = new Document({
      sections: [{
        headers: { default: new Header({ children: [new Paragraph({ children: [new TextRun("页眉标记")] })] }) },
        footers: { default: new Footer({ children: [new Paragraph({ children: [new TextRun("页脚标记")] })] }) },
        children: [
          new Paragraph({ children: [new TextRun("第一页")] }),
          new Paragraph({ children: [new ImageRun({ type: "png", data: png, transformation: { width: 40, height: 20 } })] }),
          new Paragraph({ children: [new PageBreak()] }),
          new Paragraph({ children: [new TextRun("第二页")] }),
        ],
      }],
    });
    const imported = await importDocx(await blobToLatin1(await Packer.toBlob(file)));
    expect(imported.header?.[0]).toMatchObject({ type: "text", text: "页眉标记" });
    expect(imported.footer?.[0]).toMatchObject({ type: "text", text: "页脚标记" });
    expect(imported.blocks.map((block) => block.type === "text" ? block.text : block.type)).toEqual(["第一页", "image", "pageBreak", "第二页"]);
    const image = imported.blocks.find((block) => block.type === "image");
    if (!image || image.type !== "image") throw new Error("missing image");
    expect(image.src.startsWith("data:image/png;base64,")).toBe(true);
    expect(image.width).toBeGreaterThan(0);
    expect(image.height).toBeGreaterThan(0);
  });

  it("drops pictures inside table cells but keeps cell text", async () => {
    const png = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="), (char) => char.charCodeAt(0));
    const file = new Document({
      sections: [{
        children: [
          new Table({
            width: { size: 5000, type: WidthType.DXA },
            rows: [
              new TableRow({
                children: [
                  new TableCell({
                    verticalAlign: VerticalAlign.CENTER,
                    children: [
                      new Paragraph({ children: [new ImageRun({ type: "png", data: png, transformation: { width: 40, height: 20 } })] }),
                      new Paragraph({ children: [new TextRun("环节图旁文字")] }),
                    ],
                  }),
                  new TableCell({ children: [new Paragraph({ children: [new TextRun("教师活动")] })] }),
                ],
              }),
            ],
          }),
        ],
      }],
    });
    const imported = await importDocx(await blobToLatin1(await Packer.toBlob(file)));
    const table = imported.blocks.find((block) => block.type === "table");
    if (!table || table.type !== "table") throw new Error("missing table");
    expect(table.rows[0][0].text).toContain("环节图旁文字");
    expect(table.rows[0][0].pictures).toBeUndefined();
    expect(table.rows[0][0].vAlign).toBe("middle");
    expect(imported.blocks.some((block) => block.type === "image")).toBe(false);
  });

  it("keeps a header image behind the text", async () => {
    const png = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="), (char) => char.charCodeAt(0));
    const file = new Document({
      sections: [{
        headers: {
          default: new Header({
            children: [new Paragraph({
              children: [new ImageRun({
                type: "png",
                data: png,
                transformation: { width: 120, height: 160 },
                floating: {
                  horizontalPosition: { relative: HorizontalPositionRelativeFrom.PAGE, offset: 0 },
                  verticalPosition: { relative: VerticalPositionRelativeFrom.PAGE, offset: 0 },
                  behindDocument: true,
                  wrap: { type: TextWrappingType.NONE },
                },
              })],
            })],
          }),
        },
        children: [new Paragraph({ children: [new TextRun("底板正文")] })],
      }],
    });
    const imported = await importDocx(await blobToLatin1(await Packer.toBlob(file)));
    expect(imported.header).toBeUndefined();
    expect(imported.backdrop?.[0]?.src.startsWith("data:image/png;base64,")).toBe(true);
    expect(imported.blocks.some((block) => block.type === "text" && block.text === "底板正文")).toBe(true);
    expect(imported.blocks.some((block) => block.type === "image")).toBe(false);
  });
});