CREATE TABLE `sites` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`docs_url` text NOT NULL,
	`app_name` text NOT NULL,
	`brand_color` text NOT NULL,
	`brand_content_color` text NOT NULL,
	`server_url` text NOT NULL,
	`cors_origin` text NOT NULL,
	`assistant_icon_url` text NOT NULL,
	`system_prompt` text NOT NULL,
	`welcome_message` text NOT NULL,
	`rate_limit_rpm` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `rate_limit_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`ip` text NOT NULL,
	`site_id` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `rate_limit_ip_site_created_idx` ON `rate_limit_entries` (`ip`,`site_id`,`created_at`);
