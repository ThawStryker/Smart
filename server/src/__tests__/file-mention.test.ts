import { describe, it, expect } from "vitest";
import { extractFileMention, stripFileMentions, toWorkspacePath, withFocusFile } from "../lib/file-mention";

const files = ["课稿.md", "notes/大纲.md"];

describe("extractFileMention", () => {
  it("matches a workspace file", () => {
    expect(extractFileMention("#课稿.md 改封面", files)).toBe("课稿.md");
    expect(extractFileMention("请改 #notes/大纲.md", files)).toBe("notes/大纲.md");
  });

  it("matches with a space after #", () => {
    expect(extractFileMention("# 课稿.md 写教案", files)).toBe("课稿.md");
  });

  it("ignores unknown names and in-word hashes", () => {
    expect(extractFileMention("#没有这个.md", files)).toBeNull();
    expect(extractFileMention("abc#课稿.md", files)).toBeNull();
  });
});

describe("stripFileMentions", () => {
  it("removes the #file token", () => {
    expect(stripFileMentions("#课稿.md 改封面", files)).toBe("改封面");
    expect(stripFileMentions("# 课稿.md 写教案", files)).toBe("写教案");
  });
});

describe("withFocusFile", () => {
  it("puts this-turn path into the user text", () => {
    expect(withFocusFile("写教案", "逐字稿.md")).toBe("用户本轮指定文档：workspace/逐字稿.md\n写教案");
  });
});

describe("toWorkspacePath", () => {
  it("prefixes workspace/", () => {
    expect(toWorkspacePath("课稿.md")).toBe("workspace/课稿.md");
    expect(toWorkspacePath("workspace/课稿.md")).toBe("workspace/课稿.md");
  });
});
