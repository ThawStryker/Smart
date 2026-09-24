/**
 * useActiveFile.test.ts
 *
 * 测试 active file 状态的打开/关闭/更新/重命名/保存逻辑。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useActiveFile } from '@/hooks/useActiveFile';
import { blockFileSaves, unblockFileSaves } from '@/lib/file-api';

describe('useActiveFile', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    unblockFileSaves("workspace/逐字稿.md");
    unblockFileSaves("agents/通识课教研/context/agent-layout.md");
  });

  it('starts with no active file', () => {
    const { result } = renderHook(() => useActiveFile());
    expect(result.current.activeFile).toBeNull();
    expect(result.current.isStreaming).toBe(false);
  });

  it('opens a file with content', () => {
    const { result } = renderHook(() => useActiveFile());

    act(() => {
      result.current.open('/src/main.ts', 'console.log("hello");');
    });

    expect(result.current.activeFile).toEqual({
      path: '/src/main.ts',
      content: 'console.log("hello");',
    });
    expect(result.current.isStreaming).toBe(false);
  });

  it('re-opens a cached file with saved content', () => {
    const { result } = renderHook(() => useActiveFile());

    act(() => {
      result.current.open('/doc.md', 'original');
    });
    act(() => {
      result.current.updateContent('modified');
    });
    act(() => {
      result.current.open('/doc.md', 'original');
    });

    // 应该显示 modified（缓存优先）
    expect(result.current.activeFile?.content).toBe('modified');
  });

  it("closes the active file", () => {
    const { result } = renderHook(() => useActiveFile());

    act(() => {
      result.current.open("/test.ts", "content");
    });
    act(() => {
      result.current.close();
    });

    expect(result.current.activeFile).toBeNull();
  });

  it("reopens the last saved content instead of the stale tree snapshot", () => {
    const { result } = renderHook(() => useActiveFile());

    act(() => {
      result.current.open("workspace/doc.md", "original");
    });
    act(() => {
      result.current.updateContent("edited-in-preview");
    });
    act(() => {
      result.current.close();
    });
    act(() => {
      result.current.open("workspace/doc.md", "original");
    });

    expect(result.current.activeFile?.content).toBe("edited-in-preview");
  });

  it('updates content and sets streaming state', () => {
    const { result } = renderHook(() => useActiveFile());

    act(() => {
      result.current.open('/file.md', '');
    });
    act(() => {
      result.current.setIsStreaming(true);
    });
    act(() => {
      result.current.updateContent('# Hello');
    });

    expect(result.current.isStreaming).toBe(true);
    expect(result.current.activeFile?.content).toBe('# Hello');
  });

  it('bypassCache starts a stream write from empty, then appends', () => {
    const { result } = renderHook(() => useActiveFile());

    act(() => {
      result.current.open('/doc.md', 'original');
    });
    act(() => {
      result.current.updateContent('modified');
    });
    act(() => {
      result.current.open('/doc.md', '', { bypassCache: true });
      result.current.setIsStreaming(true);
      result.current.appendContent('# Hello');
      result.current.appendContent('\nworld');
    });

    expect(result.current.activeFile?.content).toBe('# Hello\nworld');
    expect(result.current.isStreaming).toBe(true);
  });

  it('renames a file and updates active file path', () => {
    const { result } = renderHook(() => useActiveFile());

    act(() => {
      result.current.open('/old.md', '# content');
    });
    act(() => {
      result.current.rename('/old.md', '/new.md');
    });

    expect(result.current.activeFile?.path).toBe('/new.md');
    expect(result.current.activeFile?.content).toBe('# content');
  });

  it("blocks PUT to the old path after rename so flush cannot recreate it", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useActiveFile());

    act(() => {
      result.current.open("workspace/逐字稿.md", "lesson", { bypassCache: true });
    });
    fetchMock.mockClear();
    act(() => {
      result.current.rename("workspace/逐字稿.md", "workspace/新文件 3.md");
    });
    await act(async () => {
      await result.current.save("workspace/逐字稿.md", "lesson", 1);
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.activeFile).toEqual({
      path: "workspace/新文件 3.md",
      content: "lesson",
    });
  });

  it("rename is a no-op if oldPath does not match active file", () => {
    const { result } = renderHook(() => useActiveFile());

    act(() => {
      result.current.open('/active.md', 'content');
    });
    act(() => {
      result.current.rename('/other.md', '/other2.md');
    });

    // active file unchanged
    expect(result.current.activeFile?.path).toBe('/active.md');
  });

  it("ignores stale editor flush for a file that is no longer active", () => {
    const { result } = renderHook(() => useActiveFile());

    act(() => {
      result.current.open("agents/教研/skills/write-lesson-plan/SKILL.md", "# 写教案");
    });
    act(() => {
      result.current.open("workspace/新文件.md", "", { bypassCache: true });
    });
    act(() => {
      result.current.updateContent("# 写教案", "agents/教研/skills/write-lesson-plan/SKILL.md");
    });

    expect(result.current.activeFile).toEqual({
      path: "workspace/新文件.md",
      content: "",
    });
  });

  it("does not PUT a file that is being deleted", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    const path = "agents/通识课教研/context/agent-layout.md";
    blockFileSaves(path);
    const { result } = renderHook(() => useActiveFile());
    await act(async () => {
      await result.current.save(path, "revived", 1);
    });
    expect(fetchMock).not.toHaveBeenCalled();
    unblockFileSaves(path);
  });

  it("clears cache on close when the file is being deleted", () => {
    const path = "agents/通识课教研/context/agent-layout.md";
    const { result } = renderHook(() => useActiveFile());
    act(() => {
      result.current.open(path, "original");
    });
    act(() => {
      result.current.updateContent("edited");
    });
    blockFileSaves(path);
    act(() => {
      result.current.close();
    });
    unblockFileSaves(path);
    act(() => {
      result.current.open(path, "from-tree");
    });
    expect(result.current.activeFile?.content).toBe("from-tree");
  });

  it('saves file via correct API endpoint for workspace path', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useActiveFile());

    await act(async () => {
      await result.current.save('workspace/doc.md', '# saved', 1);
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/work/workspace/doc.md',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ content: '# saved' }),
      }),
    );
  });

  it('saves file via correct API endpoint for agent path', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useActiveFile());

    await act(async () => {
      await result.current.save('agents/my-agent/SKILL.md', '# skill', 1);
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/agents/my-agent/files/SKILL.md',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ content: '# skill' }),
      }),
    );
  });

  it('saves file via correct API endpoint for session path', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useActiveFile());

    await act(async () => {
      await result.current.save('notes/ideas.md', '# ideas', 42);
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/work/sessions/42/files/notes/ideas.md',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ content: '# ideas' }),
      }),
    );
  });

  it('encodes special characters in file paths', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useActiveFile());

    await act(async () => {
      await result.current.save('中文/文件.md', '# 测试', 1);
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/work/sessions/1/files/%E4%B8%AD%E6%96%87/%E6%96%87%E4%BB%B6.md',
      expect.anything(),
    );
  });
});
