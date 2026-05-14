import { db, storage } from "edgespark";
import { eq, inArray } from "drizzle-orm";
import { skills as skillsDef, buckets } from "@defs";

// Fallback superpowers SKILL.md — used when no DB record exists
const FALLBACK_SUPERPOWERS = `# Superpowers 研发工作流

你是 Smart Agent，在任何开发任务中必须遵守以下工作流。

## 流程总览
brainstorm → plan → execute → verify

## 阶段说明

### Brainstorm（需求分析）
- 用 list_files 了解项目结构
- 提出 2-3 种方案，分析优缺点，推荐一种
- 告诉用户你打算怎么做，询问有没有要补充的
- 等用户确认后再进入下一步
- 此阶段不要写代码

### Plan（编写计划）
- 用 Markdown 写开发计划
- 每步说明改哪个文件、做什么
- 让用户确认计划
- 此阶段不要写代码

### Execute（实施）
- 严格按计划逐步实施
- 每步完成后验证结果
- 遇到问题及时报告

### Verify（验证）
- 检查文件内容是否正确
- 确认文件结构完整
- 报告验证结果

## 对话风格
- 直接说明你要做什么，不要客套
- 好的："我先看下项目结构，然后给你方案。"
- 避免："太好了！我很兴奋能帮你做这个！"

## 工具使用原则
- 并行优先：独立操作同时执行
- 验证原则：每次工具调用后检查结果
- 分解原则：复杂问题拆成小步骤

### Commands
- /brainstorming — 启动需求分析和方案设计
- /writing-plans — 编写详细的实施计划
- /subagent-driven — 按计划分步执行实施
- /test-driven — 先写测试再写实现代码
- /debugging — 系统化调试问题和错误
- /code-review — 完成前进行代码审查
- /verification — 完成前验证所有修改
- /deploy — 部署当前项目到生产环境
- /market — 浏览 Smart 工具市场
- /web-search — 在网络上搜索实时信息
- /list-files — 列出项目中的所有文件
- /read-file — 读取指定文件内容`;

async function readSkillMd(storagePath: string): Promise<string | null> {
  const md = await storage.from(buckets.sourceBuckets).get(storagePath + "SKILL.md");
  if (md) return new TextDecoder().decode(md.body);
  const list = await storage.from(buckets.sourceBuckets).list({ prefix: storagePath, limit: 50 });
  const mdPath = list.files.find(f => f.path.endsWith("/SKILL.md") || f.path.endsWith("SKILL.md"));
  if (mdPath) {
    const obj = await storage.from(buckets.sourceBuckets).get(mdPath.path);
    if (obj) return new TextDecoder().decode(obj.body);
  }
  return null;
}

export async function buildSkillPrompt(selectedSkills: string[]): Promise<string> {
  let result = "";

  // Always inject superpowers
  const skillsToLoad = new Set(selectedSkills);
  skillsToLoad.add("superpowers");

  let foundSuperpowers = false;
  const loadedNames: string[] = [];
  const rows = await db.select().from(skillsDef).where(inArray(skillsDef.name, [...skillsToLoad]));
  for (const skill of rows) {
    if (skill.status !== "installed" || !skill.storagePath) continue;
    const content = await readSkillMd(skill.storagePath);
    if (content) {
      if (skill.name === "superpowers") foundSuperpowers = true;
      loadedNames.push(skill.name);
      result += `\n\n## Skill: ${skill.name}\n\n${content.slice(0, 8000)}`;
    }
  }

  // Tell the Agent to actively use loaded skills
  if (loadedNames.length > 0) {
    result += `\n\n## 可用技能\n\n当前已加载以下技能。你需要自行判断何时使用哪个技能：当用户的需求匹配某个技能的专长时，主动采用该技能的方法论和流程来完成任务。\n\n${loadedNames.map(n => `- **${n}**`).join("\n")}`;
  }

  // Fallback: if no superpowers record in DB, use hardcoded version
  if (!foundSuperpowers) {
    result += `\n\n## Skill: superpowers\n\n${FALLBACK_SUPERPOWERS}`;
  }

  return result;
}

export async function getSkillCommands(selectedSkills?: string[]): Promise<
  Array<{ skillName: string; skillId: number; commands: Array<{ name: string; description: string }> }>
> {
  const result: Array<{ skillName: string; skillId: number; commands: Array<{ name: string; description: string }> }> = [];

  // Load selected skills (if any) and parse their commands
  if (selectedSkills && selectedSkills.length > 0) {
    const rows = await db.select().from(skillsDef).where(inArray(skillsDef.name, selectedSkills));

    for (const skill of rows) {
      if (!skill.storagePath) continue;
      const content = await readSkillMd(skill.storagePath);
      const slug = "/" + skill.name.toLowerCase().replace(/\s+/g, "-");
      if (!content) {
        result.push({ skillName: skill.name, skillId: skill.id, commands: [{ name: slug, description: `调用 ${skill.name} 技能` }] });
        continue;
      }
      const m = content.match(/###\s+Commands\s*\n([\s\S]*?)(?=\n###|\n##|$)/i);
      if (!m) {
        result.push({ skillName: skill.name, skillId: skill.id, commands: [{ name: slug, description: `调用 ${skill.name} 技能` }] });
        continue;
      }
      const commands: Array<{ name: string; description: string }> = [];
      for (const line of m[1].split("\n")) {
        const cmdMatch = line.match(/-\s+`(\/[a-z_-]+)`\s*[—–-]?\s*(.*)/i);
        if (cmdMatch) commands.push({ name: cmdMatch[1], description: cmdMatch[2].trim() });
      }
      if (commands.length > 0) {
        result.push({ skillName: skill.name, skillId: skill.id, commands });
      } else {
        result.push({ skillName: skill.name, skillId: skill.id, commands: [{ name: slug, description: `调用 ${skill.name} 技能` }] });
      }
    }
  }

  // Always add superpowers commands (it's always auto-loaded)
  result.push({
    skillName: "superpowers",
    skillId: 0,
    commands: [
      { name: "/brainstorming", description: "启动需求分析和方案设计" },
      { name: "/writing-plans", description: "编写详细的实施计划" },
      { name: "/subagent-driven", description: "按计划分步执行实施" },
      { name: "/test-driven", description: "先写测试再写实现代码" },
      { name: "/debugging", description: "系统化调试问题和错误" },
      { name: "/code-review", description: "完成前进行代码审查" },
      { name: "/verification", description: "完成前验证所有修改" },
    ],
  });

  // Always add built-in system commands
  result.push({
    skillName: "Smart 内置",
    skillId: -1,
    commands: [
      { name: "/deploy", description: "部署当前项目到生产环境" },
      { name: "/market", description: "浏览 Smart 工具市场" },
      { name: "/web-search", description: "在网络上搜索实时信息" },
      { name: "/list-files", description: "列出项目中的所有文件" },
      { name: "/read-file", description: "读取指定文件内容" },
    ],
  });

  return result;
}
