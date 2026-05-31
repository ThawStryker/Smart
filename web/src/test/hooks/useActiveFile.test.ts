/**
 * useActiveFile.test.ts
 *
 * 测试 active file 状态的打开/关闭/更新/重命名/保存逻辑。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useActiveFile } from '@/hooks/useActiveFile';

describe('useActiveFile', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
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

  it('closes the active file', () => {
    const { result } = renderHook(() => useActiveFile());

    act(() => {
      result.current.open('/test.ts', 'content');
    });
    act(() => {
      result.current.close();
    });

    expect(result.current.activeFile).toBeNull();
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

  it('rename is a no-op if oldPath does not match active file', () => {
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
