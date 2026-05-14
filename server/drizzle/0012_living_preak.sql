CREATE TABLE `work_agents` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`role` text DEFAULT 'developer' NOT NULL,
	`system_prompt` text DEFAULT '' NOT NULL,
	`tools` text DEFAULT 'read,write,edit,list,grep',
	`skills` text DEFAULT '',
	`created_at` text DEFAULT (datetime('now')),
	`updated_at` text DEFAULT (datetime('now'))
);
