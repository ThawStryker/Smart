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
