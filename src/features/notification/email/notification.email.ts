import type { DatabaseType } from "#/db/clients/drizzle-client";
import { UserTable } from "#/db/schemas";
import type { IMailService } from "#/mail/services/mail.service";
import { formatEnumValue } from "#/utils/formatEnum";
import { eq } from "drizzle-orm";

import type { NotificationDto } from "../notification.types";

/** Why an email notification was not sent. */
export type EmailSkipReason =
  "no_recipient" | "unverified_recipient" | "already_read" | "not_queued";

/** Result of attempting email delivery for one notification. */
export interface EmailDeliveryResult {
  /**
   * Queued mails (0 or 1).
   *
   * This is "accepted by the mail pipeline", not "delivered": the send happens
   * in the `EMAIL_QUEUE` consumer, and the provider webhooks move the row to
   * `sent`/`delivered` afterwards.
   */
  accepted: number;
  /** Set when nothing was queued, for logging and tests. */
  skipped?: EmailSkipReason;
  /** Transport failure message when the queue rejected the mail. */
  error?: string;
}

/**
 * Outbound email transport for notifications.
 *
 * Kept behind an interface so the notification service can orchestrate
 * delivery without importing `react-email` or the worker env into every module
 * that constructs a service.
 */
export interface NotificationEmailDispatcher {
  dispatch: (notification: NotificationDto) => Promise<EmailDeliveryResult>;
}

/** A dispatcher that never sends anything, for deployments without mail. */
export const noopEmailDispatcher: NotificationEmailDispatcher = {
  dispatch: async () => ({ accepted: 0, skipped: "not_queued" }),
};

export interface NotificationEmailDispatcherConfig {
  database: DatabaseType;
  /** The app's mail service, which queues the mail for the consumer. */
  mail: IMailService;
}

/**
 * Email notifications via the existing queued mail pipeline.
 *
 * Every failure mode here is a *skip*, not an error: a notification must never
 * fail because its recipient has no verified address.
 */
export function createNotificationEmailDispatcher({
  database,
  mail,
}: NotificationEmailDispatcherConfig): NotificationEmailDispatcher {
  return {
    async dispatch(notification) {
      // Reading a notification mails you is pointless noise.
      if (notification.isRead) {
        return { accepted: 0, skipped: "already_read" };
      }

      const [recipient] = await database
        .select({
          email: UserTable.email,
          name: UserTable.name,
          emailVerified: UserTable.emailVerified,
        })
        .from(UserTable)
        .where(eq(UserTable.id, notification.recipientId))
        .limit(1);

      if (!recipient?.email) {
        return { accepted: 0, skipped: "no_recipient" };
      }

      // Mailing unverified addresses is how a sending domain accrues
      // complaints and bounces.
      if (!recipient.emailVerified) {
        return { accepted: 0, skipped: "unverified_recipient" };
      }

      const result = await mail.sendNotificationMail({
        to: recipient.email,
        userName: recipient.name,
        title: notification.title,
        message: notification.message,
        category: formatEnumValue(notification.category),
        level: formatEnumValue(notification.level),
      });

      if (!result.success) {
        return { accepted: 0, error: result.error ?? "Mail was not queued" };
      }

      return { accepted: 1 };
    },
  };
}
