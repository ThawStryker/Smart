// @vitest-environment node
import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { createPdfDocument, patchPdfText } from "./document";
import { exportDocxDocument } from "./export-docx";

describe("docx export", () => {
  it("writes the editor text into a docx package", async () => {
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
    const styled = patchPdfText(doc, text.id, { bold: true, text: "课时标题" });
    const blob = await exportDocxDocument(styled);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect(String.fromCharCode(bytes[0], bytes[1])).toBe("PK");
    const zip = await JSZip.loadAsync(bytes);
    const xml = await zip.file("word/document.xml")?.async("string");
    expect(xml).toContain("课时标题");
    expect(xml).toContain("教学环节");
    expect(xml).toContain("w:b");
  });

  it("keeps exported tables inside the page margins", async () => {
    const blob = await exportDocxDocument({
      ...createPdfDocument(),
      page: { width: 820, height: 1160, marginTop: 99, marginRight: 74, marginBottom: 99, marginLeft: 74 },
      blocks: [{
        id: "table",
        type: "table",
        colWidths: [0.171, 0.829],
        rows: [[{ text: "认知" }, { text: "教学目标" }]],
      }],
    });
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const xml = await zip.file("word/document.xml")?.async("string") ?? "";
    const pgSz = xml.match(/<w:pgSz\b([^/>]*)/)?.[1] ?? "";
    const pgMar = xml.match(/<w:pgMar\b([^/>]*)/)?.[1] ?? "";
    const tblW = xml.match(/<w:tblW\b([^/>]*)/)?.[1] ?? "";
    const attr = (chunk: string, name: string) => Number(chunk.match(new RegExp(`w:${name}="(\\d+)"`))?.[1]);
    expect(attr(tblW, "w")).toBe(attr(pgSz, "w") - attr(pgMar, "left") - attr(pgMar, "right"));
  });
});