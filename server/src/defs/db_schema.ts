import { sql } from "drizzle-orm";
import { integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

// 用户扩展信息（基础认证由 EdgeSpark 管理）
export const userProfiles = sqliteTable("user_profiles", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id").notNull().unique(),
  displayName: text("display_name"),
  avatarPath: text("avatar_path"),
  role: text("role").default("user"),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
});

// 项目
export const projects = sqliteTable("projects", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  status: text("status").default("draft"),
  progress: integer("progress").default(0),
  config: text("config"),
  iconPath: text("icon_path"),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").default(sql`(datetime('now'))`),
});

// 工具（一个项目可生成多个工具版本）
export const tools = sqliteTable("tools", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: integer("project_id").notNull(),
  name: text("name").notNull(),
  version: text("version").notNull(),
  sourcePath: text("source_path"),
  buildArtifactPath: text("build_artifact_path"),
  previewUrl: text("preview_url"),
  status: text("status").default("building"),
  hmrEnabled: integer("hmr_enabled", { mode: "boolean" }).default(false),
  metadata: text("metadata"),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
});

// 执行步骤
export const executionSteps = sqliteTable("execution_steps", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  toolId: integer("tool_id").notNull(),
  stepOrder: integer("step_order").notNull(),
  type: text("type").notNull(),
  status: text("status").default("pending"),
  title: text("title"),
  detail: text("detail"),
  startedAt: text("started_at"),
  completedAt: text("completed_at"),
  metadata: text("metadata"),
  terminalOutput: text("terminal_output"),
});

// 对话记录
export const conversations = sqliteTable("conversations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: integer("project_id").notNull(),
  userId: text("user_id").notNull(),
  role: text("role").notNull(),
  content: text("content").notNull(),
  attachments: text("attachments"),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
});

// 版本快照
export const versions = sqliteTable("versions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  toolId: integer("tool_id").notNull(),
  versionNumber: text("version_number").notNull(),
  changelog: text("changelog"),
  snapshotPath: text("snapshot_path"),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
});

// 工具市场
export const marketListings = sqliteTable("market_listings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  toolId: integer("tool_id").notNull(),
  sellerId: text("seller_id").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  price: real("price"),
  category: text("category"),
  downloads: integer("downloads").default(0),
  ratingAvg: real("rating_avg"),
  status: text("status").default("pending_review"),
  type: text("type").default("tool"),          // NEW: "tool" | "url"
  url: text("url"),                             // NEW: external URL
  version: integer("version").default(1),       // NEW: version number
  featured: integer("featured", { mode: "boolean" }).default(false),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
});

// 工具运行时数据（内置数据 API）
export const toolData = sqliteTable("tool_data", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: integer("project_id").notNull(),
  userId: text("user_id").notNull(),
  key: text("key").notNull(),
  value: text("value").notNull(), // JSON string
  createdAt: text("created_at").default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").default(sql`(datetime('now'))`),
}, (table) => ({
  uniqueProjectUserKey: uniqueIndex("tool_data_project_user_key").on(table.projectId, table.userId, table.key),
}));

// 自定义域名部署
export const domains = sqliteTable("domains", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: integer("project_id").notNull(),
  toolId: integer("tool_id").notNull(),
  domain: text("domain").notNull().unique(),
  status: text("status").default("pending"), // pending → active → removed
  files: text("files"),                       // JSON: [{ path, content }]
  createdAt: text("created_at").default(sql`(datetime('now'))`),
  verifiedAt: text("verified_at"),
});

// 工具独立用户系统
export const toolUsers = sqliteTable("tool_users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: integer("project_id").notNull(),
  email: text("email").notNull(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
}, (table) => ({
  uniqueProjectEmail: uniqueIndex("tool_users_project_email").on(table.projectId, table.email),
}));

// 技能/Skills 管理
export const skills = sqliteTable("skills", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  description: text("description"),
  visibility: text("visibility").default("private"), // "global" | "private"
  ownerId: text("owner_id").notNull(),
  sourceType: text("source_type").notNull(), // "zip" | "git"
  sourceUrl: text("source_url"),
  storagePath: text("storage_path").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).default(true),
  status: text("status").default("installing"), // installing → installed → failed
  errorMessage: text("error_message"),
  hidden: integer("hidden", { mode: "boolean" }).default(false),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").default(sql`(datetime('now'))`),
});

// MCPs 管理
export const mcps = sqliteTable("mcps", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  description: text("description"),
  visibility: text("visibility").default("private"), // "global" | "private"
  ownerId: text("owner_id").notNull(),
  config: text("config"), // JSON
  enabled: integer("enabled", { mode: "boolean" }).default(true),
  hidden: integer("hidden", { mode: "boolean" }).default(false),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").default(sql`(datetime('now'))`),
});

// 用户记忆
export const userMemories = sqliteTable("user_memories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id").notNull(),
  type: text("type").notNull(), // "preference" | "pattern" | "feedback" | "fact"
  key: text("key").notNull(),
  value: text("value").notNull(),
  confidence: real("confidence").default(0.5),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").default(sql`(datetime('now'))`),
});

// 项目记忆
export const projectMemories = sqliteTable("project_memories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: integer("project_id").notNull(),
  type: text("type").notNull(), // "decision" | "architecture" | "issue" | "pattern"
  title: text("title").notNull(),
  content: text("content").notNull(),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
});

// 对话阶段状态
export const conversationStates = sqliteTable("conversation_states", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: integer("project_id").notNull().unique(),
  phase: text("phase").notNull().default("execute"), // "brainstorm" | "plan" | "execute" | "verify"
  pendingConfirm: integer("pending_confirm", { mode: "boolean" }).default(false),
  contextJson: text("context_json"), // JSON: 阶段上下文
  updatedAt: text("updated_at").default(sql`(datetime('now'))`),
});

// Work — 多角色协同 Agent
export const workAgents = sqliteTable("work_agents", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  role: text("role").notNull().default("developer"), // architect|developer|reviewer|designer|custom
  systemPrompt: text("system_prompt").notNull().default(""),
  tools: text("tools").default("read,write,edit,list,grep"), // comma-separated
  skills: text("skills").default(""), // comma-separated skill names
  createdAt: text("created_at").default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").default(sql`(datetime('now'))`),
});
