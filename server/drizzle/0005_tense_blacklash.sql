CREATE TABLE `tool_users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`name` text NOT NULL,
	`created_at` text DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tool_users_project_email` ON `tool_users` (`project_id`,`email`);