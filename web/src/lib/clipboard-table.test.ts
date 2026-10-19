import { describe, expect, it } from "vitest";
import { colsToPx, layoutFromClipboardHtml, recalledTableLayout, rememberCopiedTableLayouts, tableHtmlForExternalPaste } from "./clipboard-table";

describe("colsToPx", () => {
  it("keeps the ratios and sums to the table width", () => {
    const px = colsToPx([0.1475, 0.1761, 0.1546, 0.5218], 600);
    expect(px).toHaveLength(4);
    expect(px.reduce((sum, value) => sum + value, 0)).toBe(600);
    expect(px[3]).toBeGreaterThan(px[0]);
    expect(px[3]).toBeGreaterThan(px[1]);
  });
});

describe("tableHtmlForExternalPaste", () => {
  it("writes pixel widths on col and cells, not equal percents", () => {
    document.body.innerHTML = "<table><tr><th>环节</th><th>任务卡名称</th><th>资源类型</th><th>教学逐字稿</th></tr></table>";
    const table = document.querySelector("table") as HTMLTableElement;
    const html = tableHtmlForExternalPaste(table, { cols: [0.1475, 0.1761, 0.1546, 0.5218], widthPx: 600 });
    expect(html).toContain("table-layout:fixed");
    expect(html).toContain('width="600"');
    expect(html).toMatch(/width="3\d{2}"/);
    expect(html).not.toContain("%");
  });

  it("reads column ratios back from copied html", () => {
    document.body.innerHTML = "<table><tr><th>环节</th><th>任务卡名称</th><th>资源类型</th><th>教学逐字稿</th></tr></table>";
    const table = document.querySelector("table") as HTMLTableElement;
    const html = tableHtmlForExternalPaste(table, { cols: [0.1475, 0.1761, 0.1546, 0.5218], widthPx: 600 })
      + '<!-- smart-table cols="0.1475,0.1761,0.1546,0.5218" -->';
    const layout = layoutFromClipboardHtml(html);
    expect(layout?.cols).toHaveLength(4);
    expect(layout?.cols?.[0]).toBeCloseTo(0.1475, 3);
    expect(layout?.cols?.[3]).toBeCloseTo(0.5218, 3);
  });
});

describe("rememberCopiedTableLayouts", () => {
  it("recalls the last copied column ratios in the same browser", () => {
    rememberCopiedTableLayouts([{ cols: [0.1475, 0.1761, 0.1546, 0.5218] }]);
    const layout = recalledTableLayout();
    expect(layout?.cols?.[3]).toBeCloseTo(0.5218, 3);
  });
});
