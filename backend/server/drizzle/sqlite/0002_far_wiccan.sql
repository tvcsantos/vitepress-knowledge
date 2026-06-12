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
	`created_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `conversations` ADD `site_id` text REFERENCES sites(id);