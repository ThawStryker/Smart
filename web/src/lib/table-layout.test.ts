import { describe, expect, it } from "vitest";
import {
  formatLayoutComment,
  persistTableLayouts,
  parseLayoutComment,
  resizeCols,
  stripTableLayouts,
} from "./table-layout";

describe("smart-table comments", () => {
  it("round-trips custom cols and row heights", () => {
    const comment = formatLayoutComment({ cols: [0.2, 0.8], rows: [40, 0, 72] });
    expect(comment).toContain("cols=");
    expect(comment).toContain("rows=");
    expect(parseLayoutComment(comment)).toMatchObject({
      cols: [0.2, 0.8],
      rows: [40, 0, 72],
    });
  });

  it("does not write a comment for equal columns and auto rows", () => {
    expect(formatLayoutComment({ cols: [0.5, 0.5], rows: [0, 0] })).toBe("");
  });

  it("strips comments after pipe tables and puts them back in order", () => {
    const md = [
      "前言",
      "| a | b |",
      "| --- | --- |",
      "| 1 | 2 |",
      "<!-- smart-table cols=\"0.3,0.7\" -->",
      "",
      "| x |",
      "| --- |",
      "| y |",
      "后记",
    ].join("\n");
    const { md: body, layouts } = stripTableLayouts(md);
    expect(body).not.toContain("smart-table");
    expect(layouts).toHaveLength(2);
    expect(layouts[0]?.cols).toEqual([0.3, 0.7]);
    expect(layouts[1]).toEqual({});
    const saved = persistTableLayouts(body, [{ cols: [0.3, 0.7] }, {}]);
    expect(saved).toContain("<!-- smart-table cols=\"0.3,0.7\" -->");
    expect(saved.match(/smart-table/g)?.length).toBe(1);
  });
});

describe("resizeCols", () => {
  it("moves width between neighboring columns and keeps the floor", () => {
    const next = resizeCols([0.5, 0.5], 0, 0.1);
    expect(next[0]).toBeCloseTo(0.6);
    expect(next[1]).toBeCloseTo(0.4);
    const floored = resizeCols([0.09, 0.91], 0, -0.5);
    expect(floored[0]).toBeCloseTo(0.08);
  });
});
