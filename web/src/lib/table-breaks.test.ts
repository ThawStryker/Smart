import { describe, it, expect } from "vitest";
import {
  brToLineSepInTables,
  CELL_BR_TOKEN,
  cellPartsToMarkdown,
  findLiteralBoldInText,
  persistTableCellBreaks,
  replacePipeTables,
  serializeCellInlines,
  wrapMarkedText,
} from "./table-breaks";
import { matrixToGfm } from "./paste-table";

describe("replacePipeTables", () => {
  it("swaps flattened pipe tables for br versions in order", () => {
    const md = "前言\n| 环节 | 稿 |\n| --- | --- |\n| 引入 | 小宇：哇！ 小星：英语 |\n后记\n";
    const tables = [
      matrixToGfm([
        ["环节", "稿"],
        ["引入", "小宇：哇！\n小星：英语"],
      ]) || "",
    ];
    const next = replacePipeTables(md, tables);
    expect(next).toContain("小宇：哇！<br>小星：英语");
    expect(next).toContain("前言");
    expect(next).toContain("后记");
  });
});

describe("brToLineSepInTables", () => {
  it("only rewrites br inside pipe rows", () => {
    const md = "段落下的<br>不算\n| 引入 | 小宇：哇！<br>小星：英语 |\n";
    const next = brToLineSepInTables(md);
    expect(next).toContain("段落下的<br>不算");
    expect(next).toContain(`小宇：哇！${CELL_BR_TOKEN}小星：英语`);
    expect(next).not.toMatch(/\|.*<br>/);
  });
});

describe("persistTableCellBreaks", () => {
  it("keeps markdown when the doc has no tables", () => {
    const fakeDoc = {
      descendants: (fn: (node: { type: { name: string } }) => boolean | void) => {
        fn({ type: { name: "paragraph" } });
      },
    };
    expect(persistTableCellBreaks("hello", fakeDoc as never)).toBe("hello");
  });
});

describe("cellPartsToMarkdown", () => {
  it("closes bold before a line break so GFM can parse ** on reload", () => {
    const md = cellPartsToMarkdown([
      { kind: "text", text: "小朋友们，一起来回顾今天学到的知识吧！", marks: [] },
      { kind: "br" },
      { kind: "br" },
      { kind: "text", text: "对话上下文 - 上下文就是我们和AI的对话记录，它是AI的记忆", marks: ["strong"] },
      { kind: "br" },
      { kind: "text", text: "首先，我们知道人的记忆存在大脑里", marks: [] },
      { kind: "br" },
      { kind: "text", text: "上下文限制 - 一个对话窗口是一个独立上下文", marks: ["strong"] },
      { kind: "br" },
      { kind: "text", text: "另外，我们还知道了AI 的记忆只在当前这个对话窗口里", marks: [] },
    ]);
    expect(md).toBe(
      [
        "小朋友们，一起来回顾今天学到的知识吧！",
        "",
        "**对话上下文 - 上下文就是我们和AI的对话记录，它是AI的记忆**",
        "首先，我们知道人的记忆存在大脑里",
        "**上下文限制 - 一个对话窗口是一个独立上下文**",
        "另外，我们还知道了AI 的记忆只在当前这个对话窗口里",
      ].join("\n"),
    );
    const gfm = matrixToGfm([
      ["环节", "稿"],
      ["巩固", md],
    ]);
    expect(gfm).toContain("**对话上下文 - 上下文就是我们和AI的对话记录，它是AI的记忆**<br>首先，我们知道人的记忆存在大脑里<br>**上下文限制 - 一个对话窗口是一个独立上下文**<br>");
    expect(gfm).toContain("记忆**<br>首先");
    expect(gfm).not.toContain("记忆<br>首先");
  });

  it("wraps strong as markdown asterisks", () => {
    expect(wrapMarkedText("导图节点", ["strong"])).toBe("**导图节点**");
    expect(wrapMarkedText("台词", [])).toBe("台词");
    expect(wrapMarkedText("导图 ", ["strong"])).toBe("**导图** ");
  });
});

describe("serializeCellInlines", () => {
  it("walks hardbreak and strong marks instead of flattening to textContent", () => {
    const text = (value: string, marks: string[] = []) => ({
      type: { name: "text" },
      isText: true,
      text: value,
      marks: marks.map((name) => ({ type: { name } })),
      forEach: () => {},
    });
    const hardbreak = {
      type: { name: "hardbreak" },
      isText: false,
      marks: [],
      forEach: () => {},
    };
    const paragraph = {
      type: { name: "paragraph" },
      isText: false,
      forEach: (fn: (child: unknown) => void) => {
        fn(text("导图节点", ["strong"]));
        fn(hardbreak);
        fn(text("台词"));
      },
    };
    const cell = {
      type: { name: "table_cell" },
      isText: false,
      textContent: "导图节点台词",
      forEach: (fn: (child: unknown) => void) => {
        fn(paragraph);
      },
    };
    expect(serializeCellInlines(cell as never)).toBe("**导图节点**\n台词");
  });
});

describe("findLiteralBoldInText", () => {
  it("finds paired asterisks left in a cell after parse failed", () => {
    expect(findLiteralBoldInText("**导图节点**台词")).toEqual([{ from: 0, to: 8 }]);
    expect(findLiteralBoldInText("台词没有加粗")).toEqual([]);
  });
});
