/**
 * useSessions.test.ts
 *
 * 测试 session CRUD hooks 的 fetch 调用和状态更新逻辑。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSessions } from '@/hooks/useSessions';

const mockSessions = [
  { id: 1, title: '会话1', summary: '' },
  { id: 2, title: '会话2', summary: '测试' },
];

function mockFetchOk(data: unknown) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(data),
  });
}

describe('useSessions', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetchOk([]));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('starts with empty sessions and loading=true', () => {
    const { result } = renderHook(() => useSessions());
    expect(result.current.sessions).toEqual([]);
    expect(result.current.loading).toBe(true);
  });

  it('loads sessions from API', async () => {
    vi.stubGlobal('fetch', mockFetchOk(mockSessions));
    const { result } = renderHook(() => useSessions());

    await act(async () => {
      await result.current.load();
    });

    expect(result.current.sessions).toEqual(mockSessions);
    expect(result.current.loading).toBe(false);
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/work/sessions');
  });

  it('creates a new session', async () => {
    const newSession = { id: 3, title: '新对话', summary: '' };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(newSession),
      }),
    );

    const { result } = renderHook(() => useSessions());

    let created: unknown;
    await act(async () => {
      created = await result.current.create();
    });

    expect(created).toEqual(newSession);
    expect(result.current.sessions).toContainEqual(newSession);
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/work/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '新对话' }),
    });
  });

  it('renames a session', async () => {
    vi.stubGlobal('fetch', mockFetchOk(mockSessions));
    const { result } = renderHook(() => useSessions());
    await act(async () => { await result.current.load(); });

    await act(async () => {
      await result.current.rename(1, '新标题');
    });

    const renamed = result.current.sessions.find((s) => s.id === 1);
    expect(renamed?.title).toBe('新标题');
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/work/sessions/1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '新标题' }),
    });
  });

  it('deletes a session', async () => {
    vi.stubGlobal('fetch', mockFetchOk(mockSessions));
    const { result } = renderHook(() => useSessions());
    await act(async () => { await result.current.load(); });

    await act(async () => {
      await result.current.remove(1);
    });

    expect(result.current.sessions.find((s) => s.id === 1)).toBeUndefined();
    expect(result.current.sessions.length).toBe(1);
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/work/sessions/1', {
      method: 'DELETE',
    });
  });
});
