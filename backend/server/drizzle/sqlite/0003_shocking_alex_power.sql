CREATE TABLE `rate_limit_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`ip` text NOT NULL,
	`site_id` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `rate_limit_ip_site_created_idx` ON `rate_limit_entries` (`ip`,`site_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `sites` ADD `rate_limit_rpm` integer;