/**
 * builtin-tools.test.ts
 *
 * 测试 filterToolsForPhase：4 个阶段 × 8 个工具的权限矩阵。
 * brainstorm/plan/verify 阶段：只允许读工具（read_file, list_files, grep_files, web_search, smart_market, load_skill）
 * execute 阶段：允许所有工具（含 write_file, edit_file）
 */
import { describe, it, expect } from 'vitest';
import { BUILTIN_TOOLS, filterToolsForPhase } from '../agent/tools/builtin';

const READ_TOOLS = ['read_file', 'list_files', 'grep_files', 'web_search', 'smart_market', 'load_skill'];
const WRITE_TOOLS = ['write_file', 'edit_file'];
const ALL_TOOLS = [...READ_TOOLS, ...WRITE_TOOLS];

describe('filterToolsForPhase', () => {
  it('returns all tools for execute phase', () => {
    const result = filterToolsForPhase(BUILTIN_TOOLS, 'execute');
    expect(result.map(t => t.function.name).sort()).toEqual(ALL_TOOLS.sort());
  });

  it('returns only read tools for brainstorm phase', () => {
    const result = filterToolsForPhase(BUILTIN_TOOLS, 'brainstorm');
    const names = result.map(t => t.function.name).sort();
    expect(names).toEqual(READ_TOOLS.sort());
    expect(names).not.toContain('write_file');
    expect(names).not.toContain('edit_file');
  });

  it('returns only read tools for plan phase', () => {
    const result = filterToolsForPhase(BUILTIN_TOOLS, 'plan');
    const names = result.map(t => t.function.name).sort();
    expect(names).toEqual(READ_TOOLS.sort());
    expect(names).not.toContain('write_file');
    expect(names).not.toContain('edit_file');
  });

  it('returns only read tools for verify phase', () => {
    const result = filterToolsForPhase(BUILTIN_TOOLS, 'verify');
    const names = result.map(t => t.function.name).sort();
    expect(names).toEqual(READ_TOOLS.sort());
    expect(names).not.toContain('write_file');
    expect(names).not.toContain('edit_file');
  });

  it('returns all tools for unknown phase', () => {
    const result = filterToolsForPhase(BUILTIN_TOOLS, 'unknown');
    expect(result.map(t => t.function.name).sort()).toEqual(ALL_TOOLS.sort());
  });

  it('does not mutate the original list', () => {
    const copy = [...BUILTIN_TOOLS];
    filterToolsForPhase(BUILTIN_TOOLS, 'brainstorm');
    expect(BUILTIN_TOOLS.length).toBe(copy.length);
  });

  it('handles empty tool list', () => {
    const result = filterToolsForPhase([], 'execute');
    expect(result).toEqual([]);
  });

  it('each read tool is preserved with full definition', () => {
    const result = filterToolsForPhase(BUILTIN_TOOLS, 'brainstorm');
    // 验证工具定义结构完整
    for (const tool of result) {
      expect(tool).toHaveProperty('type', 'function');
      expect(tool.function).toHaveProperty('name');
      expect(tool.function).toHaveProperty('description');
      expect(tool.function).toHaveProperty('parameters');
    }
  });
});

describe('BUILTIN_TOOLS definition integrity', () => {
  it('has exactly 8 tools', () => {
    expect(BUILTIN_TOOLS.length).toBe(8);
  });

  it('all tools have required fields', () => {
    for (const tool of BUILTIN_TOOLS) {
      expect(tool.type).toBe('function');
      expect(typeof tool.function.name).toBe('string');
      expect(tool.function.name.length).toBeGreaterThan(0);
      expect(typeof tool.function.description).toBe('string');
      expect(tool.function.description.length).toBeGreaterThan(0);
      expect(tool.function.parameters).toBeDefined();
    }
  });

  it('all tool names are unique', () => {
    const names = BUILTIN_TOOLS.map(t => t.function.name);
    expect(new Set(names).size).toBe(names.length);
  });
});
