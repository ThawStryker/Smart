# Moxt.ai 参考分析

> 2026-05-14 调研，用于 Smart 后续开发参考

## Moxt 核心设计

**Agent 能力公式：**
> Agent = 工具 × 上下文 ×（人格 + Memory + Skill）

## Smart 可借鉴的功能

### 1. Memory 系统（优先级：高）
- Agent 自动记住用户偏好、历史决策
- 用 embedding 向量化存储，检索时余弦相似度匹配
- 注入 System Prompt 实现"越聊越懂你"
- 实现方式：D1 存向量 + embedding API

### 2. Rules / AGENTS.md（优先级：高）
- 用户可手动编辑的 Agent 行为规则文件
- 定义人格、写作风格、价值观、语气偏好
- 比 System Prompt 更透明、用户可控制
- 实现方式：项目级 AGENTS.md 文件，对话时注入 prompt

### 3. 多 Agent 协作（优先级：低）
- Team Space 中 @Agent 实现一主多从
- 人才市场预封装 Agent
- 实现方式：按领域拆分 Agent（前端、后端、设计），主 Agent 调度

### 4. MCP 生态（优先级：中）
- 已集成 Slack、GitHub、飞书
- 通过 MCP 连接 Sentry、Figma、Linear
- 实现方式：支持社区 MCP 安装（类似 Skills）

## 定价参考
- $100 = 10,000 积分
- 一次日报 ~150 积分，一个网站 ~700-800 积分

## 来源
- https://www.53ai.com/news/tishicijiqiao/2026042770581.html
- https://blog.csdn.net/weixin_39789918/article/details/160655198
