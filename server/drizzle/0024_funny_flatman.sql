CREATE TABLE `debug_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` integer NOT NULL,
	`data_json` text NOT NULL,
	`created_at` text DEFAULT (datetime('now'))
);
