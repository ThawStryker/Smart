CREATE TABLE `workspace_files` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `user_id` text NOT NULL,
  `path` text NOT NULL,
  `content` text DEFAULT '',
  `is_folder` integer DEFAULT 0,
  `created_at` text DEFAULT (datetime('now')),
  `updated_at` text DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workspace_files_path_unique` ON `workspace_files` (`user_id`,`path`);
