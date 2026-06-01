CREATE TABLE `agent_file_versions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`file_id` integer NOT NULL,
	`path` text NOT NULL,
	`content` text NOT NULL,
	`created_at` text DEFAULT (datetime('now'))
);
