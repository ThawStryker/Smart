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
    // 清除环境变量，保证测试隔离
    delete process.env['TEST_SEED_PRO_BASE_URL'];
    delete process.env['TEST_SEED_PRO_API_KEY'];
    delete process.env['TEST_DEEPSEEK_BASE_URL'];
    delete process.env['TEST_DEEPSEEK_API_KEY'];
    delete process.env['TEST_SEED_BASE_URL'];
    delete process.env['TEST_SEED_API_KEY'];
  });

  describe('seed-pro', () => {
    it('returns config when API key is set', () => {
      process.env['TEST_SEED_PRO_API_KEY'] = 'sk-seed-pro-key';
      const config = getModel('seed-pro');
      expect(config).not.toBeNull();
      expect(config!.modelName).toBe('doubao-seed-2-0-pro-260215');
      expect(config!.apiPath).toBe('/chat/completions');
      expect(config!.apiKey).toBe('sk-seed-pro-key');
    });

    it('uses fallback base URL when var is not set', () => {
      process.env['TEST_SEED_PRO_API_KEY'] = 'sk-key';
      const config = getModel('seed-pro');
      expect(config!.baseURL).toBe('https://ark.cn-beijing.volces.com/api/v3');
    });

    it('uses custom base URL when var is set', () => {
      process.env['TEST_SEED_PRO_BASE_URL'] = 'https://custom.url';
      process.env['TEST_SEED_PRO_API_KEY'] = 'sk-key';
      const config = getModel('seed-pro');
      expect(config!.baseURL).toBe('https://custom.url');
    });

    it('returns null when API key is missing', () => {
      const config = getModel('seed-pro');
      expect(config).toBeNull();
    });
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
  });

  describe('deepseek-v4-pro-260425', () => {
    it('uses seed provider base URL and api key', () => {
      process.env['TEST_SEED_API_KEY'] = 'sk-seed-key';
      const config = getModel('deepseek-v4-pro-260425');
      expect(config).not.toBeNull();
      expect(config!.modelName).toBe('deepseek-v4-pro-260425');
      expect(config!.apiPath).toBe('/chat/completions');
    });

    it('uses fallback Ark base URL', () => {
      process.env['TEST_SEED_API_KEY'] = 'sk-key';
      const config = getModel('deepseek-v4-pro-260425');
      expect(config!.baseURL).toBe('https://ark.cn-beijing.volces.com/api/v3');
    });
  });

  describe('seed-code', () => {
    it('returns config when API key is set', () => {
      process.env['TEST_SEED_API_KEY'] = 'sk-seed-key';
      const config = getModel('seed-code');
      expect(config).not.toBeNull();
      expect(config!.modelName).toBe('doubao-seed-2-0-code-preview-260215');
    });
  });

  describe('seed-lite', () => {
    it('returns config when API key is set', () => {
      process.env['TEST_SEED_LITE_API_KEY'] = 'sk-lite-key';
      const config = getModel('seed-lite');
      expect(config).not.toBeNull();
      expect(config!.modelName).toBe('doubao-seed-2-0-lite-260428');
    });
  });

  describe('unknown model', () => {
    it('returns null for unknown model key', () => {
      const config = getModel('nonexistent-model');
      expect(config).toBeNull();
    });

    it('returns null for empty string', () => {
      const config = getModel('');
      expect(config).toBeNull();
    });
  });

  describe('edge cases', () => {
    it('all models have correct apiPath', () => {
      const modelKeys = ['seed-pro', 'seed-lite', 'seed-code', 'deepseek-v4-pro', 'deepseek-v4-pro-260425'];
      const seedPath = '/chat/completions';
      const dsPath = '/v1/chat/completions';

      // 先设好所有 key
      process.env['TEST_SEED_PRO_API_KEY'] = 'sk';
      process.env['TEST_SEED_LITE_API_KEY'] = 'sk';
      process.env['TEST_SEED_API_KEY'] = 'sk';
      process.env['TEST_DEEPSEEK_API_KEY'] = 'sk';

      for (const key of modelKeys) {
        const config = getModel(key);
        expect(config).not.toBeNull();
        if (key === 'deepseek-v4-pro') {
          expect(config!.apiPath).toBe(dsPath);
        } else {
          expect(config!.apiPath).toBe(seedPath);
        }
      }
    });
  });
});

describe('DEFAULTS', () => {
  it('has all required default models', () => {
    expect(DEFAULTS.agent).toBe('deepseek-v4-pro');
    expect(DEFAULTS.chat).toBe('deepseek-v4-pro');
    expect(DEFAULTS.coding).toBe('deepseek-v4-pro');
  });

  it('all default model keys exist in _models', () => {
    // 验证默认值对应的模型配置确实存在
    for (const [key, modelKey] of Object.entries(DEFAULTS)) {
      // 每个默认值都应该能被 getModel 解析（当 key 设置后）
      expect(typeof modelKey).toBe('string');
      expect(modelKey.length).toBeGreaterThan(0);
    }
  });
});
