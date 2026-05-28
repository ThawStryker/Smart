DROP TABLE IF EXISTS `agent_files`;
--> statement-breakpoint
CREATE TABLE `agent_files` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `user_id` text NOT NULL,
  `agent_name` text NOT NULL,
  `path` text NOT NULL,
  `content` text DEFAULT '',
  `is_folder` integer DEFAULT 0,
  `created_at` text DEFAULT (datetime('now')),
  `updated_at` text DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agent_files_agent_path_unique` ON `agent_files` (`user_id`,`agent_name`,`path`);
