/**
 * 全局测试 setup
 *
 * Mock edgespark / edgespark/http — 这些模块依赖 Cloudflare Workers 运行时，
 * 在 Node.js 的 vitest 中不可用。
 * @defs 不需要 mock —— drizzle-orm 的表定义只是数据结构对象，可正常导入。
 */

import { vi } from 'vitest';

// ── Mock edgespark ──

interface MockQueryBuilder {
  from: (table: any) => { where: (cond: any) => Promise<any[]>; orderBy: (col: any) => { limit: (n: number) => Promise<any[]> } };
}

function createDbMock() {
  // 默认返回空数组
  const defaultChain = () => Promise.resolve([]);

  const mockSelect = vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => Promise.resolve([])),
      orderBy: vi.fn(() => ({
        limit: vi.fn(() => Promise.resolve([])),
      })),
    })),
  }));

  const mockInsert = vi.fn(() => ({
    values: vi.fn(() => ({
      returning: vi.fn(() => Promise.resolve([])),
    })),
  }));

  const mockUpdate = vi.fn(() => ({
    set: vi.fn(() => ({
      where: vi.fn(() => Promise.resolve()),
    })),
  }));

  const mockDelete = vi.fn(() => ({
    where: vi.fn(() => Promise.resolve()),
  }));

  const mockBatch = vi.fn((ops: any[]) => Promise.resolve(ops.map(() => [])));

  return {
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
    delete: mockDelete,
    batch: mockBatch,
    // 辅助：重置所有 mock
    _reset: () => {
      mockSelect.mockClear();
      mockInsert.mockClear();
      mockUpdate.mockClear();
      mockDelete.mockClear();
      mockBatch.mockClear();
    },
  };
}

const mockDb = createDbMock();

vi.mock('edgespark', () => ({
  db: mockDb,
  storage: {
    from: vi.fn(() => ({
      get: vi.fn(),
      put: vi.fn(),
      list: vi.fn(),
      createPresignedPutUrl: vi.fn(),
      createPresignedGetUrl: vi.fn(),
    })),
    createS3Uri: vi.fn(),
    parseS3Uri: vi.fn(),
    tryParseS3Uri: vi.fn(),
  },
  secret: {
    get: vi.fn((key: string) => {
      const env = process.env['TEST_' + key];
      return env || undefined;
    }),
  },
  vars: {
    get: vi.fn((key: string) => {
      const env = process.env['TEST_' + key];
      return env || undefined;
    }),
  },
  ctx: {
    runInBackground: vi.fn((fn: () => Promise<void>) => {
      // 在测试中同步执行，保证断言可见
      fn().catch(() => {});
    }),
    environment: 'test',
  },
}));

// ── Mock edgespark/http ──

vi.mock('edgespark/http', () => ({
  auth: {
    user: { id: 'test-user-id' },
    isAuthenticated: vi.fn(() => true),
  },
}));

// ── 导出辅助方法供测试使用 ──

export { mockDb };
export type { MockQueryBuilder };
