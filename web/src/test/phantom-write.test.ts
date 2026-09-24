import { describe, it, expect } from "vitest";
import { isPhantomWritePath } from "@/components/work/ChatPanel";

describe("isPhantomWritePath", () => {
  it("rejects empty and (unsaved)", () => {
    expect(isPhantomWritePath("")).toBe(true);
    expect(isPhantomWritePath("  ")).toBe(true);
    expect(isPhantomWritePath("(unsaved)")).toBe(true);
    expect(isPhantomWritePath(undefined)).toBe(true);
  });

  it("allows real files", () => {
    expect(isPhantomWritePath("workspace/课稿.md")).toBe(false);
    expect(isPhantomWritePath("agents/通识课教研/SKILL.md")).toBe(false);
  });
});
