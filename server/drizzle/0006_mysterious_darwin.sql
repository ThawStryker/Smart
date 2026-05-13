CREATE TABLE `mcps` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`visibility` text DEFAULT 'private',
	`owner_id` text NOT NULL,
	`config` text,
	`enabled` integer DEFAULT true,
	`created_at` text DEFAULT (datetime('now')),
	`updated_at` text DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE TABLE `skills` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`visibility` text DEFAULT 'private',
	`owner_id` text NOT NULL,
	`source_type` text NOT NULL,
	`source_url` text,
	`storage_path` text NOT NULL,
	`enabled` integer DEFAULT true,
	`created_at` text DEFAULT (datetime('now')),
	`updated_at` text DEFAULT (datetime('now'))
);
--> statement-breakpoint
ALTER TABLE `market_listings` ADD `type` text DEFAULT 'tool';--> statement-breakpoint
ALTER TABLE `market_listings` ADD `url` text;--> statement-breakpoint
ALTER TABLE `market_listings` ADD `version` integer DEFAULT 1;