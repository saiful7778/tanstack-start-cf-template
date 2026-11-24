CREATE TABLE `emails` (
	`id` text PRIMARY KEY NOT NULL,
	`thread_id` text,
	`direction` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`resend_id` text,
	`resend_message_id` text,
	`q_message_id` text,
	`subject` text,
	`text_body` text,
	`html_body` text,
	`headers` text,
	`metadata` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`thread_id`) REFERENCES `email_threads`(`id`) ON UPDATE no action ON DELETE set null
);

CREATE INDEX `email_emailThreadId_idx` ON `emails` (`thread_id`);
CREATE UNIQUE INDEX `email_resendId_idx` ON `emails` (`resend_id`);
CREATE UNIQUE INDEX `email_qMessageId_idx` ON `emails` (`q_message_id`);
CREATE INDEX `email_messageId_idx` ON `emails` (`resend_message_id`);
CREATE INDEX `email_direction_idx` ON `emails` (`direction`);
CREATE INDEX `email_status_idx` ON `emails` (`status`);
CREATE INDEX `email_createdAt_idx` ON `emails` (`created_at`);
CREATE TABLE `email_attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`email_id` text NOT NULL,
	`filename` text NOT NULL,
	`content_type` text NOT NULL,
	`content_id` text,
	`content_disposition` text,
	`size` integer,
	`storage_key` text,
	`url` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`email_id`) REFERENCES `emails`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE INDEX `emailAttachment_emailId_idx` ON `email_attachments` (`email_id`);
CREATE INDEX `emailAttachment_contentId_idx` ON `email_attachments` (`content_id`);
CREATE TABLE `email_recipients` (
	`id` text PRIMARY KEY NOT NULL,
	`email_id` text NOT NULL,
	`type` text NOT NULL,
	`email` text NOT NULL,
	`name` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`email_id`) REFERENCES `emails`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE INDEX `emailRecipient_emailId_idx` ON `email_recipients` (`email_id`);
CREATE INDEX `emailRecipient_email_idx` ON `email_recipients` (`email`);
CREATE INDEX `emailRecipient_type_idx` ON `email_recipients` (`type`);
CREATE TABLE `email_threads` (
	`id` text PRIMARY KEY NOT NULL,
	`subject` text NOT NULL,
	`contact_email` text NOT NULL,
	`contact_name` text,
	`is_closed` integer DEFAULT false NOT NULL,
	`closed_at` integer,
	`closed_by` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`closed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);

CREATE INDEX `emailThread_closedBy_idx` ON `email_threads` (`closed_by`);
CREATE INDEX `emailThread_contactEmail_idx` ON `email_threads` (`contact_email`);
CREATE INDEX `emailThread_isClosed_idx` ON `email_threads` (`is_closed`);
CREATE TABLE `permissions` (
	`id` text PRIMARY KEY NOT NULL,
	`level` text NOT NULL,
	`resource` text NOT NULL,
	`action` text NOT NULL,
	`description` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);

CREATE UNIQUE INDEX `permission_level_resource_action_key` ON `permissions` (`level`,`resource`,`action`);
CREATE INDEX `permission_level_idx` ON `permissions` (`level`);
CREATE INDEX `permission_resource_idx` ON `permissions` (`resource`);
CREATE INDEX `permission_action_idx` ON `permissions` (`action`);
CREATE TABLE `roles` (
	`id` text PRIMARY KEY NOT NULL,
	`role_name` text DEFAULT 'USER' NOT NULL,
	`description` text
);

CREATE UNIQUE INDEX `role_name_unique` ON `roles` (`role_name`);
CREATE TABLE `role_permissions` (
	`id` text PRIMARY KEY NOT NULL,
	`role_id` text NOT NULL,
	`permission_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`permission_id`) REFERENCES `permissions`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE UNIQUE INDEX `role_permission_unique` ON `role_permissions` (`role_id`,`permission_id`);
CREATE INDEX `role_permission_role_idx` ON `role_permissions` (`role_id`);
CREATE INDEX `role_permission_permission_idx` ON `role_permissions` (`permission_id`);
CREATE TABLE `user_roles` (
	`id` text PRIMARY KEY NOT NULL,
	`role_id` text NOT NULL,
	`user_id` text NOT NULL,
	`assigned_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE UNIQUE INDEX `user_role_unique` ON `user_roles` (`user_id`,`role_id`);
CREATE INDEX `user_role_role_id_idx` ON `user_roles` (`role_id`);
CREATE INDEX `user_role_user_id_idx` ON `user_roles` (`user_id`);
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`role` text NOT NULL,
	`banned` integer DEFAULT false,
	`ban_reason` text,
	`ban_expires` integer,
	`timezone` text DEFAULT 'Asia/Dhaka' NOT NULL,
	`locale` text DEFAULT 'en-US' NOT NULL,
	`currency` text DEFAULT 'USD' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);

CREATE UNIQUE INDEX `user_email_key` ON `users` (`email`);
CREATE TABLE `user_devices` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`fingerprint` text NOT NULL,
	`browser` text,
	`os` text,
	`device_type` text,
	`first_seen_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`last_seen_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE UNIQUE INDEX `user_device_user_fingerprint_idx` ON `user_devices` (`user_id`,`fingerprint`);
CREATE INDEX `user_device_user_id_idx` ON `user_devices` (`user_id`);
CREATE TABLE `user_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`device_id` text,
	`session_id` text NOT NULL,
	`login_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`last_seen_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`logout_at` integer,
	`expires_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`device_id`) REFERENCES `user_devices`(`id`) ON UPDATE no action ON DELETE set null
);

CREATE INDEX `user_session_user_id_idx` ON `user_sessions` (`user_id`);
CREATE UNIQUE INDEX `user_session_session_id_idx` ON `user_sessions` (`session_id`);
CREATE INDEX `user_session_login_at_idx` ON `user_sessions` (`login_at`);
CREATE INDEX `user_session_last_seen_at_idx` ON `user_sessions` (`last_seen_at`);
CREATE TABLE `user_events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`email` text,
	`event` text NOT NULL,
	`session_id` text,
	`device_id` text,
	`ip_address` text,
	`user_agent` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`device_id`) REFERENCES `user_devices`(`id`) ON UPDATE no action ON DELETE set null
);

CREATE INDEX `user_event_user_id_idx` ON `user_events` (`user_id`);
CREATE INDEX `user_event_event_idx` ON `user_events` (`event`);
CREATE INDEX `user_event_created_at_idx` ON `user_events` (`created_at`);
CREATE INDEX `user_event_session_id_idx` ON `user_events` (`session_id`);
CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`user_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE UNIQUE INDEX `account_accountProvider_accountId_idx` ON `accounts` (`provider_id`,`account_id`);
CREATE INDEX `account_userId_idx` ON `accounts` (`user_id`);
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`token` text NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`impersonated_by` text,
	`user_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE UNIQUE INDEX `session_token_idx` ON `sessions` (`token`);
CREATE INDEX `session_userId_idx` ON `sessions` (`user_id`);
CREATE INDEX `session_expiresAt_idx` ON `sessions` (`expires_at`);
CREATE TABLE `verifications` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);

