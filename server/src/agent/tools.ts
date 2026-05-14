import { db, storage } from "edgespark";
import { eq, inArray } from "drizzle-orm";
import { mcps, skills as skillsDef, buckets } from "@defs";
import type { Phase } from "./workflow";

// === Built-in tool definitions ===

const BUILTIN_TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "read_file",
      description: "读取项目中的文件内容",
      parameters: {
        type: "object",
        properties: { path: { type: "string", description: "文件路径" } },
        required: ["path"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "write_file",
      description: "创建或覆盖文件",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "文件路径" },
          content: { type: "string", description: "文件内容" },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "edit_file",
      description: "在文件中搜索并替换指定内容",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "文件路径" },
          old_string: { type: "string", description: "要替换的原始文本" },
          new_string: { type: "string", description: "替换后的新文本" },
        },
        required: ["path", "old_string", "new_string"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "list_files",
      description: "列出项目中的所有文件",
      parameters: {
        type: "object",
        properties: { prefix: { type: "string", description: "可选的路径前缀过滤" } },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "grep_files",
      description: "在项目文件中搜索匹配的文本模式（正则）",
      parameters: {
        type: "object",
        properties: {
          pattern: { type: "string", description: "要搜索的正则表达式模式" },
          path: { type: "string", description: "可选的文件路径限制" },
        },
        required: ["pattern"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "web_search",
      description: "在网络上搜索实时信息",
      parameters: {
        type: "object",
        properties: { query: { type: "string", description: "搜索关键词" } },
        required: ["query"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "smart_market",
      description: "浏览 Smart 工具市场中的已发布工具",
      parameters: { type: "object", properties: {} },
    },
  },
];

// Phase-based tool categories
const WRITE_TOOLS = new Set(["write_file", "edit_file"]);
const READ_TOOLS = new Set(["read_file", "list_files", "grep_files"]);

// === Tool registry ===

export interface ToolDef {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export async function buildToolList(
  phase: Phase,
  selectedMcps: string[],
): Promise<{ tools: ToolDef[]; mcpMap: Map<string, Record<string, unknown>> }> {
  const tools: ToolDef[] = [];
  const mcpMap = new Map<string, Record<string, unknown>>();

  // Add built-in tools based on phase
  for (const t of BUILTIN_TOOLS) {
    const name = t.function.name;
    if (phase === "brainstorm" || phase === "plan" || phase === "verify") {
      // Read-only phases: only allow read + search + market
      if (READ_TOOLS.has(name) || name === "web_search" || name === "smart_market") {
        tools.push(t);
      }
    } else {
      tools.push(t);
    }
  }

  // Always inject smart-deploy as built-in for execute phase
  if (phase === "execute") {
    const [smartDeploy] = await db.select().from(mcps).where(eq(mcps.name, "smart-deploy"));
    if (smartDeploy && smartDeploy.enabled && smartDeploy.config) {
      try {
        const cfg = JSON.parse(smartDeploy.config);
        tools.push({
          type: "function",
          function: {
            name: "smart_deploy",
            description: cfg.description || "Deploy the current project",
            parameters: cfg.parameters || { type: "object", properties: {} },
          },
        });
      } catch {}
    }
  }

  // Add user-selected MCPs (write tools only in execute phase)
  if (selectedMcps.length > 0) {
    const mcpRows = await db.select().from(mcps).where(inArray(mcps.name, selectedMcps));
    for (const m of mcpRows) {
      if (m.enabled && m.config) {
        try {
          const cfg = JSON.parse(m.config);
          const name = m.name.replace(/-/g, "_");
          const tool: ToolDef = {
            type: "function",
            function: { name, description: cfg.description || m.name, parameters: cfg.parameters || { type: "object", properties: {} } },
          };
          // In non-execute phases, skip MCP tools that look like write tools
          if (phase !== "execute") {
            const desc = (cfg.description || m.name || "").toLowerCase();
            if (desc.includes("write") || desc.includes("edit") || desc.includes("create") || desc.includes("deploy")) {
              continue;
            }
          }
          tools.push(tool);
          mcpMap.set(name, cfg);
        } catch {}
      }
    }
  }

  return { tools, mcpMap };
}

// === Skill injection ===

export async function buildSkillContext(selectedSkills: string[]): Promise<string> {
  // Always inject superpowers
  const skillsToLoad = new Set(selectedSkills);
  skillsToLoad.add("superpowers");

  let ctx = "";
  const rows = await db.select().from(skillsDef).where(inArray(skillsDef.name, [...skillsToLoad]));

  for (const skill of rows) {
    if (skill.status !== "installed" || !skill.storagePath) continue;
    const md = await storage.from(buckets.sourceBuckets).get(skill.storagePath + "SKILL.md");
    if (md) {
      ctx += `\n\n## Skill: ${skill.name}\n\n${new TextDecoder().decode(md.body).slice(0, 3000)}`;
    }
  }

  return ctx;
}

export { BUILTIN_TOOLS };
