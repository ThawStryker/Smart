CREATE TABLE `work_conversations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`title` text DEFAULT '新对话' NOT NULL,
	`messages_json` text DEFAULT '[]' NOT NULL,
	`model` text DEFAULT 'seed-pro',
	`created_at` text DEFAULT (datetime('now')),
	`updated_at` text DEFAULT (datetime('now'))
);
