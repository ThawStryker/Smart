import { describe, it, expect } from "vitest";
import {
  extractMention, mentionQuery, extractFileMention, fileMentionQuery,
  activeMention, fileLabel, lastHashTrigger,
} from "./mention";

const agents = ["教研", "教研 (02)"];

describe("mentionQuery", () => {
  it("opens after @", () => {
    expect(mentionQuery("@", agents)).toBe("");
    expect(mentionQuery("@教", agents)).toBe("教");
  });

  it("keeps open while typing a spaced agent name", () => {
    expect(mentionQuery("@教研 (", agents)).toBe("教研 (");
    expect(mentionQuery("@教研 (0", agents)).toBe("教研 (0");
  });

  it("closes once the message body starts", () => {
    expect(mentionQuery("@教研 帮我写一个教学逐字稿", agents)).toBeNull();
    expect(mentionQuery("Hi", agents)).toBeNull();
  });
});

describe("extractMention", () => {
  it("picks the longer spaced name", () => {
    expect(extractMention("@教研 (02) 你好", agents)).toBe("教研 (02)");
    expect(extractMention("@教研 你好", agents)).toBe("教研");
  });
});

const files = ["课稿.md", "notes/大纲.md"];

describe("fileMentionQuery", () => {
  it("opens after #", () => {
    expect(fileMentionQuery("#", files)).toBe("");
    expect(fileMentionQuery("#课", files)).toBe("课");
  });

  it("ignores markdown headings in the middle of a word", () => {
    expect(lastHashTrigger("abc#x")).toBe(-1);
    expect(lastHashTrigger("看 #课")).toBe(2);
  });

  it("closes once the message body starts", () => {
    expect(fileMentionQuery("#课稿.md 改一下封面", files)).toBeNull();
  });
});

describe("extractFileMention", () => {
  it("matches workspace files", () => {
    expect(extractFileMention("#课稿.md 改封面", files)).toBe("课稿.md");
    expect(extractFileMention("请改 #notes/大纲.md", files)).toBe("notes/大纲.md");
    expect(extractFileMention("# 课稿.md 写教案", files)).toBe("课稿.md");
  });
});

describe("activeMention", () => {
  it("prefers the trigger closer to the cursor", () => {
    expect(activeMention("@教", agents, files)).toEqual({ kind: "agent", query: "教" });
    expect(activeMention("#课", agents, files)).toEqual({ kind: "file", query: "课" });
    expect(activeMention("@教研 #课", agents, files)).toEqual({ kind: "file", query: "课" });
  });
});

describe("fileLabel", () => {
  it("shows the basename", () => {
    expect(fileLabel("workspace/notes/大纲.md")).toBe("大纲.md");
    expect(fileLabel("课稿.md")).toBe("课稿.md");
  });
});
