CREATE TABLE `platform_auth` (
	`id` integer PRIMARY KEY NOT NULL,
	`refresh_token` text NOT NULL,
	`access_token` text,
	`expires_at` text,
	`updated_at` text DEFAULT (datetime('now'))
);
