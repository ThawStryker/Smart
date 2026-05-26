CREATE TABLE `user_agents` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`title` text DEFAULT '',
	`agents_md` text DEFAULT '',
	`user_md` text DEFAULT '',
	`memory_md` text DEFAULT '',
	`created_at` text DEFAULT (datetime('now')),
	`updated_at` text DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_agents_user_name_unique` ON `user_agents` (`user_id`,`name`);