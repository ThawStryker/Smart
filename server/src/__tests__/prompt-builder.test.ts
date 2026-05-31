/**
 * prompt/builder.ts 测试
 *
 * buildSystemMessage 将 SYSTEM_PROMPT + phase prompt + memory/skill/mcp context
 * 组装成一个完整的 system 消息。
 */
import { describe, it, expect } from 'vitest';
import { buildSystemMessage } from '../agent/prompt/builder';

describe('buildSystemMessage', () => {
  it('returns a system role message', () => {
    const msg = buildSystemMessage('execute', '', '', '');
    expect(msg.role).toBe('system');
    expect(typeof msg.content).toBe('string');
  });

  it('includes the system prompt core', () => {
    const msg = buildSystemMessage('execute', '', '', '');
    expect(msg.content).toContain('你是 Smart');
    expect(msg.content).toContain('分解哲学');
    expect(msg.content).toContain('并行优先');
  });

  it('includes phase-specific prompt for brainstorm', () => {
    const msg = buildSystemMessage('brainstorm', '', '', '');
    expect(msg.content).toContain('当前阶段：需求分析');
    expect(msg.content).toContain('先分析，不要写代码');
  });

  it('includes phase-specific prompt for plan', () => {
    const msg = buildSystemMessage('plan', '', '', '');
    expect(msg.content).toContain('当前阶段：编写开发计划');
    expect(msg.content).toContain('不要写代码');
  });

  it('includes phase-specific prompt for execute', () => {
    const msg = buildSystemMessage('execute', '', '', '');
    expect(msg.content).toContain('当前阶段：实施');
    expect(msg.content).toContain('按计划逐步实施');
  });

  it('includes phase-specific prompt for verify', () => {
    const msg = buildSystemMessage('verify', '', '', '');
    expect(msg.content).toContain('当前阶段：验证');
    expect(msg.content).toContain('检查所有修改');
  });

  it('appends memory context when provided', () => {
    const memory = '\n\n## 用户记忆\n用户喜欢暗色主题';
    const msg = buildSystemMessage('execute', memory, '', '');
    expect(msg.content).toContain('用户喜欢暗色主题');
  });

  it('appends skill context when provided', () => {
    const skills = '\n\n## 已加载 Skill\nmarkdown-writer: 写作助手';
    const msg = buildSystemMessage('execute', '', skills, '');
    expect(msg.content).toContain('markdown-writer');
  });

  it('appends MCP context when provided', () => {
    const mcp = '\n\n## MCP 工具\nfilesystem: 文件系统';
    const msg = buildSystemMessage('execute', '', '', mcp);
    expect(msg.content).toContain('filesystem');
  });

  it('appends slash command guide', () => {
    const msg = buildSystemMessage('execute', '', '', '');
    expect(msg.content).toContain('/brainstorming');
    expect(msg.content).toContain('/writing-plans');
    expect(msg.content).toContain('/subagent-driven');
    expect(msg.content).toContain('/deploy');
    expect(msg.content).toContain('/web-search');
  });

  it('combines all context types', () => {
    const msg = buildSystemMessage(
      'plan',
      '\nmemory content',
      '\nskill content',
      '\nmcp content',
    );
    expect(msg.content).toContain('memory content');
    expect(msg.content).toContain('skill content');
    expect(msg.content).toContain('mcp content');
    expect(msg.content).toContain('当前阶段：编写开发计划');
  });

  it('handles empty context gracefully', () => {
    const msg = buildSystemMessage('execute', '', '', '');
    expect(() => buildSystemMessage('execute', '', '', '')).not.toThrow();
    expect(msg.content.length).toBeGreaterThan(100);
  });
});
