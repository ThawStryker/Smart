import { describe, it, expect } from "vitest";
import { ZipReader, BlobReader, TextWriter, configure } from "@zip.js/zip.js";
import { packAgentZip, zipRootName } from "../lib/agent-zip";

configure({ useWebWorkers: false });

describe("packAgentZip", () => {
  it("packs files under the agent root folder", async () => {
    const bytes = await packAgentZip("教研", [
      { path: "AGENTS.md", content: "# 角色", isFolder: 0 },
      { path: "skills", content: "", isFolder: 1 },
      { path: "memory/USER.md", content: "user", isFolder: 0 },
    ]);
    const reader = new ZipReader(new BlobReader(new Blob([bytes])));
    const entries = await reader.getEntries();
    const names = entries.map((e) => e.filename).sort();
    expect(names).toContain("教研/AGENTS.md");
    expect(names).toContain("教研/memory/USER.md");
    expect(names.some((n) => n.replace(/\/$/, "") === "教研/skills")).toBe(true);
    const agents = entries.find((e) => e.filename === "教研/AGENTS.md");
    expect(agents?.directory).toBeFalsy();
    const text = await agents!.getData!(new TextWriter());
    expect(text).toBe("# 角色");
    await reader.close();
  });

  it("sanitizes path separators in the zip root name", () => {
    expect(zipRootName("a/b")).toBe("a_b");
  });
});
