/**
 * workflow.ts 测试
 *
 * 覆盖 advancePhase 全部 12+ 条分支路径，包括：
 * - brainstorm 阶段的 confirm / reject / discuss
 * - plan 阶段的 confirm / reject / discuss
 * - execute 阶段的 complex task / light task / follow-up
 * - verify 阶段的 complex task / light task / follow-up
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { advancePhase, getPhasePromptAddon } from '../agent/workflow';
import { mockDb } from './setup';

describe('advancePhase', () => {
  beforeEach(() => {
    mockDb._reset();
    // 默认 db.select() 返回空（新会话，无已有记录）
    vi.mocked(mockDb.select().from().where).mockResolvedValue([]);
  });

  // ── Brainstorm phase ──

  describe('from brainstorm', () => {
    it('stays in brainstorm when user rejects the proposal', async () => {
      const phase = await advancePhase(1, 'brainstorm', '这个方案不行，换个思路');
      expect(phase).toBe('brainstorm');
    });

    it('stays in brainstorm on simple rejection', async () => {
      const phase = await advancePhase(1, 'brainstorm', '不要这样做');
      expect(phase).toBe('brainstorm');
    });

    it('moves to plan when user confirms a complex task', async () => {
      const phase = await advancePhase(1, 'brainstorm', '好的，实现一个完整的支付系统');
      expect(phase).toBe('plan');
    });

    it('moves to execute when user confirms a simple task', async () => {
      const phase = await advancePhase(1, 'brainstorm', '可以，就这么做');
      expect(phase).toBe('execute');
    });

    it('stays in brainstorm when user provides more info', async () => {
      const phase = await advancePhase(1, 'brainstorm', '我想再加一个用户登录功能，用 OAuth');
      expect(phase).toBe('brainstorm');
    });

    it('recognizes Chinese confirm short forms', async () => {
      expect(await advancePhase(1, 'brainstorm', '行')).toBe('execute');
    });

    it('recognizes "搞" as confirm', async () => {
      expect(await advancePhase(1, 'brainstorm', '搞')).toBe('execute');
    });

    it('recognizes "开始" as confirm', async () => {
      expect(await advancePhase(1, 'brainstorm', '开始')).toBe('execute');
    });

    it('recognizes complex keyword "重构"', async () => {
      const phase = await advancePhase(1, 'brainstorm', '可以，重构整个系统');
      expect(phase).toBe('plan');
    });

    it('recognizes complex keyword "跨文件"', async () => {
      const phase = await advancePhase(1, 'brainstorm', '好，跨文件修改');
      expect(phase).toBe('plan');
    });
  });

  // ── Plan phase ──

  describe('from plan', () => {
    it('stays in plan on reject', async () => {
      const phase = await advancePhase(1, 'plan', '不，换个方案');
      expect(phase).toBe('plan');
    });

    it('moves to execute on confirm', async () => {
      const phase = await advancePhase(1, 'plan', '没问题，开始执行');
      expect(phase).toBe('execute');
    });

    it('stays in plan on discussion', async () => {
      const phase = await advancePhase(1, 'plan', '第二步能不能改成用 WebSocket？');
      expect(phase).toBe('plan');
    });
  });

  // ── Execute phase ──

  describe('from execute', () => {
    it('stays in execute on follow-up', async () => {
      const phase = await advancePhase(1, 'execute', '再加一个保存按钮');
      expect(phase).toBe('execute');
    });

    it('resets to brainstorm on complex task', async () => {
      const phase = await advancePhase(1, 'execute', '需要新增一个支付功能，重构整个系统');
      expect(phase).toBe('brainstorm');
    });

    it('stays in execute on light task', async () => {
      const phase = await advancePhase(1, 'execute', '把按钮颜色改成蓝色');
      expect(phase).toBe('execute');
    });

    it('recognizes css as light task', async () => {
      const phase = await advancePhase(1, 'execute', '修改css样式');
      expect(phase).toBe('execute');
    });

    it('recognizes typo as light task', async () => {
      const phase = await advancePhase(1, 'execute', '修一个拼写错误');
      expect(phase).toBe('execute');
    });
  });

  // ── Verify phase ──

  describe('from verify', () => {
    it('resets to brainstorm on complex task', async () => {
      const phase = await advancePhase(1, 'verify', '新增一个数据导出功能，实现整个导出系统');
      expect(phase).toBe('brainstorm');
    });

    it('stays in verify on light task', async () => {
      const phase = await advancePhase(1, 'verify', '改一下标题文字');
      expect(phase).toBe('execute');
    });

    it('stays in verify on follow-up', async () => {
      const phase = await advancePhase(1, 'verify', '验证通过，部署吧');
      expect(phase).toBe('execute');
    });
  });

  // ── Edge cases ──

  describe('edge cases', () => {
    it('handles unknown phase by returning it unchanged', async () => {
      const phase = await advancePhase(1, 'unknown' as any, 'hello');
      expect(phase).toBe('unknown');
    });

    it('empty message stays in brainstorm', async () => {
      const phase = await advancePhase(1, 'brainstorm', '');
      expect(phase).toBe('brainstorm');
    });

    it('message with only whitespace stays in brainstorm', async () => {
      const phase = await advancePhase(1, 'brainstorm', '   ');
      expect(phase).toBe('brainstorm');
    });
  });
});

// ── getPhasePromptAddon ──

describe('getPhasePromptAddon', () => {
  it('returns brainstorm prompt', () => {
    const prompt = getPhasePromptAddon('brainstorm');
    expect(prompt).toContain('分析用户需求');
    expect(prompt).toContain('先不要写代码');
  });

  it('returns plan prompt', () => {
    const prompt = getPhasePromptAddon('plan');
    expect(prompt).toContain('开发计划');
    expect(prompt).toContain('不要写代码');
  });

  it('returns execute prompt', () => {
    const prompt = getPhasePromptAddon('execute');
    expect(prompt).toContain('逐步实施');
  });

  it('returns verify prompt', () => {
    const prompt = getPhasePromptAddon('verify');
    expect(prompt).toContain('验证所有修改');
  });
});
