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
--> statement-breakpoint
CREATE INDEX `email_emailThreadId_idx` ON `emails` (`thread_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `email_resendId_idx` ON `emails` (`resend_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `email_qMessageId_idx` ON `emails` (`q_message_id`);--> statement-breakpoint
CREATE INDEX `email_messageId_idx` ON `emails` (`resend_message_id`);--> statement-breakpoint
CREATE INDEX `email_direction_idx` ON `emails` (`direction`);--> statement-breakpoint
CREATE INDEX `email_status_idx` ON `emails` (`status`);--> statement-breakpoint
CREATE INDEX `email_createdAt_idx` ON `emails` (`created_at`);--> statement-breakpoint
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
--> statement-breakpoint
CREATE INDEX `emailAttachment_emailId_idx` ON `email_attachments` (`email_id`);--> statement-breakpoint
CREATE INDEX `emailAttachment_contentId_idx` ON `email_attachments` (`content_id`);--> statement-breakpoint
CREATE TABLE `email_recipients` (
	`id` text PRIMARY KEY NOT NULL,
	`email_id` text NOT NULL,
	`type` text NOT NULL,
	`email` text NOT NULL,
	`name` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`email_id`) REFERENCES `emails`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `emailRecipient_emailId_idx` ON `email_recipients` (`email_id`);--> statement-breakpoint
CREATE INDEX `emailRecipient_email_idx` ON `email_recipients` (`email`);--> statement-breakpoint
CREATE INDEX `emailRecipient_type_idx` ON `email_recipients` (`type`);--> statement-breakpoint
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
--> statement-breakpoint
CREATE INDEX `emailThread_closedBy_idx` ON `email_threads` (`closed_by`);--> statement-breakpoint
CREATE INDEX `emailThread_contactEmail_idx` ON `email_threads` (`contact_email`);--> statement-breakpoint
CREATE INDEX `emailThread_isClosed_idx` ON `email_threads` (`is_closed`);