import { describe, it, expect } from "vitest";
import {
  htmlTablesToMatrix,
  htmlToTextWithBreaks,
  matrixToGfm,
  tableMarkdownFromClipboard,
  clipboardTextWithBreaks,
  tsvToMatrix,
  cellHtmlToMarkdown,
  gfmTableToMatrix,
  tableMatrixFromClipboard,
} from "./paste-table";

describe("matrixToGfm", () => {
  it("drops empty columns from Word-like grids", () => {
    const md = matrixToGfm([
      ["环节", "", "", "任务卡名称", "", "资源类型", "", "教学逐字稿"],
      ["封面", "", "", "", "", "插画", "", "（封面图：小宇）"],
    ]);
    expect(md).toContain("| 环节 | 任务卡名称 | 资源类型 | 教学逐字稿 |");
    expect(md).toContain("| 封面 |  | 插画 | （封面图：小宇） |");
    expect(md?.split("\n")[0].split("|").filter(Boolean)).toHaveLength(4);
  });

  it("turns cell line breaks into br", () => {
    const md = matrixToGfm([
      ["环节", "教学逐字稿"],
      ["趣味引入", "小星：画好了没有？\n小宇：马上就好。"],
    ]);
    expect(md).toContain("小星：画好了没有？<br>小宇：马上就好。");
  });

  it("keeps blank lines as consecutive br", () => {
    const md = matrixToGfm([
      ["环节", "稿"],
      ["巩固", "导图\n\n台词"],
    ]);
    expect(md).toContain("导图<br><br>台词");
  });
});

describe("htmlTablesToMatrix", () => {
  it("reads a basic html table", () => {
    const html = `<table><tr><th>环节</th><th>资源类型</th></tr><tr><td>封面</td><td>插画</td></tr></table>`;
    expect(htmlTablesToMatrix(html)).toEqual([
      ["环节", "资源类型"],
      ["封面", "插画"],
    ]);
  });

  it("keeps paragraph and br breaks inside a cell", () => {
    const html = `<table><tr><th>环节</th><th>教学逐字稿</th></tr><tr><td>趣味引入</td><td><p>小宇：哇！</p><p>小星：这是英语呀</p></td></tr></table>`;
    expect(htmlTablesToMatrix(html)?.[1][1]).toMatch(/小宇：哇！\n+小星：这是英语呀/);
  });

  it("keeps milkdown hardbreak and strong as markdown", () => {
    const html = `<table><tr><td>环节</td><td>稿</td></tr><tr><td>巩固</td><td>开场<br data-type="hardbreak"><strong>对话上下文 - 记忆</strong><br data-type="hardbreak">首先，我们知道</td></tr></table>`;
    expect(htmlTablesToMatrix(html)?.[1][1]).toBe("开场\n**对话上下文 - 记忆**\n首先，我们知道");
  });
});

describe("tsvToMatrix", () => {
  it("splits tabs", () => {
    const text = "环节\t资源类型\n封面\t插画";
    expect(tsvToMatrix(text)?.[0]).toEqual(["环节", "资源类型"]);
  });
});

describe("tableMarkdownFromClipboard", () => {
  it("prefers compacted html table", () => {
    const html = `<table><tr><td>环节</td><td></td><td></td><td>教学逐字稿</td></tr><tr><td>封面</td><td></td><td></td><td>插画</td></tr></table>`;
    const data = {
      getData: (type: string) => (type === "text/html" ? html : "环节\t\t\t教学逐字稿"),
    } as DataTransfer;
    const md = tableMarkdownFromClipboard(data);
    expect(md).toContain("| 环节 | 教学逐字稿 |");
    expect(md).toContain("| 封面 | 插画 |");
  });

  it("returns null for plain sentences", () => {
    const data = {
      getData: (type: string) => (type === "text/plain" ? "你好，帮我改一改" : ""),
    } as DataTransfer;
    expect(tableMarkdownFromClipboard(data)).toBeNull();
  });
});

describe("clipboardTextWithBreaks", () => {
  it("keeps html paragraphs as newlines", () => {
    const data = {
      getData: (type: string) =>
        type === "text/html"
          ? "<p>小宇：哇！这个机器狗会翻跟头！</p><p>小星：这是英语呀</p>"
          : "小宇：哇！这个机器狗会翻跟头！\n小星：这是英语呀",
    } as DataTransfer;
    expect(clipboardTextWithBreaks(data)).toMatch(/小宇：哇！这个机器狗会翻跟头！\n+小星：这是英语呀/);
  });

  it("reads a single table cell as text with breaks", () => {
    const data = {
      getData: (type: string) =>
        type === "text/html"
          ? "<table><tr><td><p>小宇：1</p><br><p>小星：2</p></td></tr></table>"
          : "小宇：1\n小星：2",
    } as DataTransfer;
    expect(clipboardTextWithBreaks(data)).toMatch(/小宇：1\n+小星：2/);
  });
});

describe("htmlToTextWithBreaks", () => {
  it("turns br into newline", () => {
    expect(htmlToTextWithBreaks("画面开始<br>小宇：哇！")).toBe("画面开始\n小宇：哇！");
  });
});

describe("gfmTableToMatrix", () => {
  it("keeps br and bold from markdown source", () => {
    const text = [
      "| 环节 | 任务卡名称 | 资源类型 | 教学逐字稿 |",
      "| --- | --- | --- | --- |",
      "| 当堂巩固 | 知识回顾 | 视频 | 小朋友们，一起来回顾今天学到的知识吧！ <br><br>**对话上下文 - 上下文就是我们和AI的对话记录，它是AI的记忆** <br>首先，我们知道 |",
    ].join("\n");
    const matrix = gfmTableToMatrix(text);
    expect(matrix?.[0]).toEqual(["环节", "任务卡名称", "资源类型", "教学逐字稿"]);
    expect(matrix?.[1][3]).toContain("**对话上下文 - 上下文就是我们和AI的对话记录，它是AI的记忆**");
    expect(matrix?.[1][3]).toContain("小朋友们，一起来回顾今天学到的知识吧！");
    expect(matrix?.[1][3]).toMatch(/\n\n\*\*对话上下文/);
  });
});

describe("tableMatrixFromClipboard", () => {
  it("uses markdown source when html table has no breaks", () => {
    const text = "| 环节 | 稿 |\n| --- | --- |\n| 巩固 | **导图节点**<br>台词 |";
    const data = {
      getData: (type: string) => (type === "text/plain" ? text : "<span>| 环节 | 稿 |</span>"),
    } as DataTransfer;
    const matrix = tableMatrixFromClipboard(data);
    expect(matrix?.[1][1]).toBe("**导图节点**\n台词");
  });
});

describe("cellHtmlToMarkdown", () => {
  it("turns attributed br into newline and strong into asterisks", () => {
    const doc = new DOMParser().parseFromString(
      `<p>台词<br data-type="hardbreak" data-is-inline="false"><strong>导图</strong></p>`,
      "text/html",
    );
    expect(cellHtmlToMarkdown(doc.body)).toBe("台词\n**导图**");
  });
});
