import { describe, expect, it } from "vitest";
import { createSession } from "../agent/mose/core/session";
import { MemoryFileStore } from "../agent/mose/core/fs";
import { dispatchTool } from "../agent/mose/core/tools";
import {
  fillTongshiLessonFromMarkdown,
  isSmartPdfJson,
  maybeWrapTongshiLessonDocx,
} from "../lib/pdf/tongshi-lesson";

const SAMPLE = `
#### **教案文档**

#### **一、课程内容**

和 AI 对话——认识 AI 大模型

#### **二、教学目标**

|  | **教学目标** |
| --- | --- |
| 认知 | 1. 学生能够**说出**上下文是 AI 的记忆 |
| 技能 | 1. 学生能够**操作**一次对话实验 |
| 思维 | 1. 学生能够**对比**人的记忆和 AI |
| 价值观 | 1. 学生能够**感知**上下文有限 |

#### **三、教学重难点**

|  | **内容** |
| --- | --- |
| 教学重点 | 理解 AI 的记忆就是对话上下文<br><br>掌握上下文的用法 |
| 教学难点 | 区分出厂知识和当前对话 |

#### **四、教学过程**

|  | **时长** | **教学环节** | **教师活动** |
| --- | --- | --- | --- |
|  | 2分钟 | 趣味引入 | 1.播放视频 |
|  | 10分钟 | 新知讲解 | 1.讲解上下文 |

#### **五、教学评价**

|  | **评价方式与工具** |
| --- | --- |
| 知识理解 | ① 看引入后的提问 |
| 操作技能 | ① 观察对话实验 |
| 思维发展 | ① 猜词挑战 |
| 意识与价值观 | ① 看课后作业反应 |
`;

describe("tongshi lesson template wrap", () => {
  it("fills the five sections into the 通识课教案 skeleton", () => {
    const doc = JSON.parse(fillTongshiLessonFromMarkdown(SAMPLE)) as {
      format: string;
      backdrop: unknown[];
      blocks: Array<{ type: string; text?: string; rows?: Array<Array<{ text: string }>> }>;
    };
    expect(doc.format).toBe("smart-pdf");
    expect(doc.backdrop?.length).toBe(1);
    const texts = doc.blocks.filter((block) => block.type === "text").map((block) => block.text);
    expect(texts).toEqual(["教案文档", "一、课程内容", "和 AI 对话——认识 AI 大模型", "二、教学目标", "三、教学重难点", "四、教学过程", "五、教学评价"]);
    const tables = doc.blocks.filter((block) => block.type === "table");
    expect(tables[0]?.rows?.map((row) => row[0].text)).toEqual(["", "认知", "技能", "思维", "价值观"]);
    expect(tables[0]?.rows?.[1]?.[1]?.text).toContain("上下文是 AI 的记忆");
    expect(tables[1]?.rows?.[1]?.[1]?.text).toBe("1. 理解 AI 的记忆就是对话上下文\n2. 掌握上下文的用法");
    expect(tables[1]?.rows?.[1]?.[1]).toMatchObject({ linePx: 30 });
    expect(tables[1]?.rows?.[1]?.[0]).toMatchObject({ linePx: 22 });
    expect(tables[1]?.rows?.[2]?.[1]?.text).toBe("1. 区分出厂知识和当前对话");
    expect(tables[2]?.rows?.[1]?.map((cell) => cell.text)).toEqual(["", "2分钟", "趣味引入", "1.播放视频"]);
    expect(tables[3]?.rows?.[1]?.[1]?.text).toContain("引入后的提问");
  });

  it("does not wrap markdown files or existing smart-pdf json", () => {
    expect(maybeWrapTongshiLessonDocx("workspace/a.md", SAMPLE, { "write-lesson-plan": "x" })).toBe(SAMPLE);
    const json = fillTongshiLessonFromMarkdown(SAMPLE);
    expect(isSmartPdfJson(json)).toBe(true);
    expect(maybeWrapTongshiLessonDocx("workspace/a.docx", json, {})).toBe(json);
  });

  it("write_file stores a tongshi template docx for the lesson-plan skill", async () => {
    const fs = new MemoryFileStore();
    const session = createSession();
    session.loadedSkills["write-lesson-plan"] = "skill";
    const result = await dispatchTool("write_file", { path: "workspace/课-教案.docx", content: SAMPLE }, fs, session);
    expect(result.result).toContain("课-教案.docx");
    const rec = await fs.read("workspace/课-教案.docx");
    const doc = JSON.parse(rec.content) as { format: string; blocks: Array<{ type: string; text?: string }> };
    expect(doc.format).toBe("smart-pdf");
    expect(doc.blocks.some((block) => block.text === "和 AI 对话——认识 AI 大模型")).toBe(true);
  });
});
