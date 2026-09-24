/**
 * useFiles：只走 workspace API，树路径带 workspace/ 前缀。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useFiles } from "@/hooks/useFiles";

function createFetchMock(responses: Record<string, unknown>) {
  return vi.fn((url: string) => {
    if (url in responses) {
      const body = responses[url];
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(body),
      });
    }
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve([]),
    });
  });
}

describe("useFiles", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", createFetchMock({}));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("starts with empty files", () => {
    const { result } = renderHook(() => useFiles(1));
    expect(result.current.files).toEqual([]);
  });

  it("loads workspace files with prefix", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url === "/api/work/workspace") {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([
            { id: 2, path: "doc.md", content: "# Workspace", isFolder: 0 },
          ]),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useFiles(1));
    await act(async () => {
      await result.current.load();
    });

    expect(result.current.files).toContainEqual(
      expect.objectContaining({ path: "workspace/doc.md" }),
    );
    expect(fetchMock).toHaveBeenCalledWith("/api/work/workspace");
  });

  it("creates a file and reloads", async () => {
    const fetchMock = vi.fn((_url: string, options?: RequestInit) => {
      if (options?.method === "PUT") {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve([
          { id: 1, path: "新文件.md", content: "", isFolder: 0 },
        ]),
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useFiles(1));
    await act(async () => {
      await result.current.create("workspace/");
    });

    expect(result.current.files).toContainEqual(
      expect.objectContaining({ path: "workspace/新文件.md" }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/work/workspace/%E6%96%B0%E6%96%87%E4%BB%B6.md",
      expect.objectContaining({ method: "PUT" }),
    );
  });

  it("creates a folder", async () => {
    const fetchMock = vi.fn((_url: string, options?: RequestInit) => {
      if (options?.method === "PUT") {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve([
          { id: 1, path: "新文件夹", content: "", isFolder: 1 },
        ]),
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useFiles(1));
    await act(async () => {
      await result.current.createFolder("workspace/");
    });

    expect(result.current.files).toContainEqual(
      expect.objectContaining({ path: "workspace/新文件夹", isFolder: 1 }),
    );
  });

  it("removes a file and calls DELETE then reloads", async () => {
    const fetchMock = vi.fn((_url: string, options?: RequestInit) => {
      if (options?.method === "DELETE") {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve([
          { id: 1, path: "keep.md", content: "", isFolder: 0 },
        ]),
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useFiles(1));
    await act(async () => {
      await result.current.remove("workspace/delete.md");
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/work/workspace/delete.md",
      expect.objectContaining({ method: "DELETE" }),
    );
    expect(fetchMock).toHaveBeenCalledWith("/api/work/workspace");
  });
});
