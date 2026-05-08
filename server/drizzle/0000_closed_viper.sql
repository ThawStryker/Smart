CREATE TABLE `conversations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`attachments` text,
	`created_at` text DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE TABLE `execution_steps` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tool_id` integer NOT NULL,
	`step_order` integer NOT NULL,
	`type` text NOT NULL,
	`status` text DEFAULT 'pending',
	`title` text,
	`detail` text,
	`started_at` text,
	`completed_at` text,
	`metadata` text
);
--> statement-breakpoint
CREATE TABLE `market_listings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tool_id` integer NOT NULL,
	`seller_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`price` real,
	`category` text,
	`downloads` integer DEFAULT 0,
	`rating_avg` real,
	`status` text DEFAULT 'pending_review',
	`created_at` text DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`status` text DEFAULT 'draft',
	`progress` integer DEFAULT 0,
	`config` text,
	`created_at` text DEFAULT (datetime('now')),
	`updated_at` text DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE TABLE `tools` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer NOT NULL,
	`name` text NOT NULL,
	`version` text NOT NULL,
	`source_path` text,
	`build_artifact_path` text,
	`preview_url` text,
	`status` text DEFAULT 'building',
	`hmr_enabled` integer DEFAULT false,
	`metadata` text,
	`created_at` text DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE TABLE `user_profiles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`display_name` text,
	`avatar_path` text,
	`role` text DEFAULT 'user',
	`created_at` text DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_profiles_user_id_unique` ON `user_profiles` (`user_id`);--> statement-breakpoint
CREATE TABLE `versions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tool_id` integer NOT NULL,
	`version_number` text NOT NULL,
	`changelog` text,
	`snapshot_path` text,
	`created_at` text DEFAULT (datetime('now'))
);
