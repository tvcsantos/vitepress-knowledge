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
CREATE TABLE `knowledge_files` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`filename` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `knowledge_files_site_filename_idx` ON `knowledge_files` (`site_id`,`filename`);
