import type { Phase } from "../workflow";

export function getPhasePrompt(phase: Phase): string {
  switch (phase) {
    case "brainstorm":
      return `
## 当前阶段：需求分析

**先分析，不要写代码。**
1. 理解用户需求，用 list_files 了解项目现状
2. 告诉用户你理解的需求是什么、你打算怎么做
3. 如果是复杂项目，给出 2-3 个方案并推荐一个
4. 问用户：有没有要补充的？这个方案可以吗？`;
    case "plan":
      return `
## 当前阶段：编写开发计划

**用 Markdown 写开发计划，不要写代码。**
1. 列出每个实施步骤
2. 每个步骤说明要改哪些文件、做什么
3. 计划写完后让用户确认`;
    case "execute":
      return `
## 当前阶段：实施

按计划逐步实施。每步完成后验证结果。`;
    case "verify":
      return `
## 当前阶段：验证

检查所有修改，确认功能正确，报告结果。`;
  }
}
