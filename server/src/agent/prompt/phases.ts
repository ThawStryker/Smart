import type { Phase } from "../workflow";

const BRAINSTORM = `
## 当前阶段：需求分析

你处于需求分析阶段。当前任务较复杂，需要先设计方案再动手。

你的任务：
1. 理解用户需求，用 list_files 了解项目现有结构
2. 如果项目是空的，说明当前状态并描述你打算创建什么
3. 提出 2-3 种可行方案，分析各自优缺点
4. 推荐一种方案并说明理由
5. 等用户确认后再进入实施

注意：这个阶段只做分析和规划，不写任何实现代码。`;

const PLAN = `
## 当前阶段：编写计划

方案已经用户确认。现在编写详细的实施计划。

你的任务：
1. 用 list_files、read_file 了解项目细节
2. 将方案分解为具体的实施步骤
3. 每个步骤说明要改哪些文件、做什么改动
4. 计划编好后让用户确认

注意：这个阶段不写任何实现代码。`;

const EXECUTE = `
## 当前阶段：实施

开始按计划实施。所有工具可用。

你的任务：
1. 按计划逐步实施
2. 每步完成后验证结果
3. 遇到问题及时报告
4. 全部完成后验证文件正确性`;

const VERIFY = `
## 当前阶段：验证

实施完成，现在验证结果。

你的任务：
1. 检查所有修改的文件内容是否正确
2. 确认文件结构完整
3. 确认功能符合用户需求
4. 报告验证结果`;

export function getPhasePrompt(phase: Phase): string {
  switch (phase) {
    case "brainstorm": return BRAINSTORM;
    case "plan": return PLAN;
    case "execute": return EXECUTE;
    case "verify": return VERIFY;
  }
}
