CREATE TABLE `domains` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer NOT NULL,
	`tool_id` integer NOT NULL,
	`domain` text NOT NULL,
	`status` text DEFAULT 'pending',
	`created_at` text DEFAULT (datetime('now')),
	`verified_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `domains_domain_unique` ON `domains` (`domain`);