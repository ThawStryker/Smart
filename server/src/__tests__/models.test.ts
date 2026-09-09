/**
 * models.ts 测试
 *
 * getModel 依赖 edgespark 的 vars.get() 和 secret.get()，
 * 在 setup.ts 中 mock 了：TEST_<KEY> 环境变量作为模拟值。
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { getModel, DEFAULTS } from '../models';

describe('getModel', () => {
  beforeEach(() => {
    delete process.env['TEST_DEEPSEEK_BASE_URL'];
    delete process.env['TEST_DEEPSEEK_API_KEY'];
  });

  describe('deepseek-v4-pro', () => {
    it('returns config when API key is set', () => {
      process.env['TEST_DEEPSEEK_API_KEY'] = 'sk-ds-key';
      const config = getModel('deepseek-v4-pro');
      expect(config).not.toBeNull();
      expect(config!.modelName).toBe('deepseek-v4-pro');
      expect(config!.apiPath).toBe('/v1/chat/completions');
      expect(config!.apiKey).toBe('sk-ds-key');
    });

    it('uses fallback base URL', () => {
      process.env['TEST_DEEPSEEK_API_KEY'] = 'sk-key';
      const config = getModel('deepseek-v4-pro');
      expect(config!.baseURL).toBe('https://api.deepseek.com');
    });

    it('uses custom base URL when var is set', () => {
      process.env['TEST_DEEPSEEK_BASE_URL'] = 'https://custom.url';
      process.env['TEST_DEEPSEEK_API_KEY'] = 'sk-key';
      const config = getModel('deepseek-v4-pro');
      expect(config!.baseURL).toBe('https://custom.url');
    });

    it('returns null when API key is missing', () => {
      const config = getModel('deepseek-v4-pro');
      expect(config).toBeNull();
    });
  });

  describe('unknown model', () => {
    it('returns null for unknown model key', () => {
      expect(getModel('nonexistent-model')).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(getModel('')).toBeNull();
    });

    it('returns null for removed seed keys', () => {
      expect(getModel('seed-pro')).toBeNull();
      expect(getModel('seed-lite')).toBeNull();
      expect(getModel('seed-code')).toBeNull();
    });
  });
});

describe('DEFAULTS', () => {
  it('all defaults point at deepseek-v4-pro', () => {
    expect(DEFAULTS.agent).toBe('deepseek-v4-pro');
    expect(DEFAULTS.chat).toBe('deepseek-v4-pro');
    expect(DEFAULTS.coding).toBe('deepseek-v4-pro');
  });
});
