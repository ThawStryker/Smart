import { describe, expect, it } from "vitest";
import { createSession } from "../agent/mose/core/session";
import { MemoryFileStore } from "../agent/mose/core/fs";
import { dispatchTool } from "../agent/mose/core/tools";
import { ensureScriptTableLayout, SCRIPT_TABLE_COMMENT } from "../lib/script-table-layout";

const SAMPLE = [
  "| 环节 | 任务卡名称 | 资源类型 | 教学逐字稿 |",
  "| --- | --- | --- | --- |",
  "| 封面 |  | 插画 | 标题：AI的身体——具身智能 |",
  "",
].join("\n");

describe("script table layout", () => {
  it("appends the column-width comment after a new 逐字稿 table", () => {
    const next = ensureScriptTableLayout("workspace/AI的身体-教学逐字稿.md", SAMPLE);
    expect(next).toContain(SCRIPT_TABLE_COMMENT);
    expect(next.indexOf("封面")).toBeLessThan(next.indexOf("smart-table"));
  });

  it("does not overwrite an existing smart-table comment", () => {
    const md = SAMPLE.replace(/\n$/, "\n<!-- smart-table cols=\"0.2,0.2,0.2,0.4\" -->\n");
    expect(ensureScriptTableLayout("workspace/a.md", md)).toBe(md);
  });

  it("ignores lesson markdown and non-md files", () => {
    expect(ensureScriptTableLayout("workspace/课-教案.docx", SAMPLE)).toBe(SAMPLE);
    expect(ensureScriptTableLayout("workspace/教案.md", "|  | **教学目标** |\n| --- | --- |\n")).not.toContain("smart-table");
  });

  it("write_file stores the column-width comment for a new 逐字稿", async () => {
    const fs = new MemoryFileStore();
    const session = createSession();
    session.loadedSkills["write-lesson-script"] = "skill";
    await dispatchTool("write_file", { path: "workspace/身体-教学逐字稿.md", content: SAMPLE }, fs, session);
    const rec = await fs.read("workspace/身体-教学逐字稿.md");
    expect(rec.content).toContain(SCRIPT_TABLE_COMMENT);
  });
});
