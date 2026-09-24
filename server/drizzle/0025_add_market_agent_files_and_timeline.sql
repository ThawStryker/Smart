CREATE TABLE `market_agent_files` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`listing_id` integer NOT NULL,
	`path` text NOT NULL,
	`content` text DEFAULT '',
	`is_folder` integer DEFAULT 0
);
--> statement-breakpoint
CREATE UNIQUE INDEX `market_agent_files_listing_path_unique` ON `market_agent_files` (`listing_id`,`path`);--> statement-breakpoint
ALTER TABLE `market_listings` ADD `source_agent_name` text;--> statement-breakpoint
ALTER TABLE `user_agents` ADD `source_listing_id` integer;--> statement-breakpoint
ALTER TABLE `work_messages` ADD `timeline_json` text;