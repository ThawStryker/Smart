CREATE TABLE `work_files` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` integer NOT NULL,
	`path` text NOT NULL,
	`content` text DEFAULT '',
	`is_folder` integer DEFAULT 0,
	`created_at` text DEFAULT (datetime('now')),
	`updated_at` text DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `work_files_session_path_unique` ON `work_files` (`session_id`,`path`);--> statement-breakpoint
CREATE TABLE `work_messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` integer NOT NULL,
	`agent_name` text,
	`role` text NOT NULL,
	`content` text DEFAULT '',
	`created_at` text DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE TABLE `work_sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`title` text DEFAULT 'New Work' NOT NULL,
	`summary` text DEFAULT '',
	`created_at` text DEFAULT (datetime('now')),
	`updated_at` text DEFAULT (datetime('now'))
);
