import { afterEach, describe, expect, it, vi } from "vitest";
import { blockFileSaves, isFileSaveBlocked, saveFileContent, unblockFileSaves } from "@/lib/file-api";

describe("saveFileContent 删除封锁", () => {
  afterEach(() => {
    unblockFileSaves("agents/通识课教研/context/agent-layout.md");
    vi.unstubAllGlobals();
  });

  it("封锁期间不发 PUT，避免编辑器卸载把文件写回来", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const path = "agents/通识课教研/context/agent-layout.md";
    blockFileSaves(path);
    expect(isFileSaveBlocked(path)).toBe(true);
    await expect(saveFileContent(path, "revived")).resolves.toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("解除封锁后可以再保存", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    const path = "agents/通识课教研/context/agent-layout.md";
    blockFileSaves(path);
    unblockFileSaves(path);
    await expect(saveFileContent(path, "ok")).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
