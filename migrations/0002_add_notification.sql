CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`recipient_id` text NOT NULL,
	`actor_id` text,
	`category` text NOT NULL,
	`level` text DEFAULT 'INFO' NOT NULL,
	`title` text NOT NULL,
	`message` text NOT NULL,
	`data` text,
	`is_read` integer DEFAULT false NOT NULL,
	`read_at` integer,
	`is_archived` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`recipient_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `notifications_recipient_idx` ON `notifications` (`recipient_id`);--> statement-breakpoint
CREATE INDEX `notifications_recipient_read_idx` ON `notifications` (`recipient_id`,`is_read`);--> statement-breakpoint
CREATE INDEX `notifications_created_at_idx` ON `notifications` (`created_at`);--> statement-breakpoint
CREATE TABLE `notification_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`category` text NOT NULL,
	`email_enabled` integer DEFAULT true NOT NULL,
	`push_enabled` integer DEFAULT true NOT NULL,
	`in_app_enabled` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notification_settings_user_category_key` ON `notification_settings` (`user_id`,`category`);--> statement-breakpoint
CREATE TABLE `push_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`endpoint` text NOT NULL,
	`p256dh` text NOT NULL,
	`auth` text NOT NULL,
	`expiration_time` real,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `push_subscription_endpoint_unique` ON `push_subscriptions` (`endpoint`);--> statement-breakpoint
CREATE INDEX `push_subscription_user_id` ON `push_subscriptions` (`user_id`);