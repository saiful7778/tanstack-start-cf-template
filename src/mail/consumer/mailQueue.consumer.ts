import type { DatabaseType } from "#/db/clients/drizzle-client";
import type { LoggerType } from "#/lib/logger";

import { mailQueueEnvelopeSchema } from "../mailQueue.schema";
import { isStatusAdvance, statusesAtOrAbove } from "../mailStatus";
import { EmailService } from "../services/email.service";
import type { IMailTransport } from "../transport/mailTransport.types";

interface MailQueueMessageLike {
  id: string;
  body: unknown;
  ack: () => void;
  retry: () => void;
}

interface MailQueueBatchLike {
  queue: string;
  messages: readonly MailQueueMessageLike[];
}

export type MailProcessStatus = "sent" | "skipped" | "invalid";

export interface MailProcessResult {
  status: MailProcessStatus;
  emailId?: string;
  resendId?: string;
}

export class MailQueueProcessor {
  constructor(
    private readonly database: DatabaseType,
    private readonly transport: IMailTransport,
    private readonly logger: LoggerType
  ) {}

  async processMessage(body: unknown): Promise<MailProcessResult> {
    const parsed = mailQueueEnvelopeSchema.safeParse(body);

    if (!parsed.success) {
      this.logger.error(
        { issues: parsed.error.issues },
        "mail.queue.invalid_payload"
      );

      return { status: "invalid" };
    }

    const { emailId } = parsed.data;
    const emailService = new EmailService(this.database);

    const email = await emailService.getEmailById(emailId);

    if (!email) {
      this.logger.warn({ emailId }, "mail.queue.email_not_found");

      return { status: "invalid", emailId };
    }

    // Anything at or past `sent` means the provider already has this mail.
    // Matching only `sent` exactly would resend a mail whose delivery webhook
    // had already moved the row on — e.g. when the worker died between the
    // status write and `ack()`, and Cloudflare redelivered the message.
    const alreadySent = statusesAtOrAbove("sent").includes(email.status);

    if (alreadySent) {
      this.logger.info(
        { emailId, status: email.status },
        "mail.queue.already_sent"
      );

      return { status: "skipped", emailId };
    }

    try {
      const options = await emailService.buildOutboundEmailOptions(emailId);
      const resendId = await this.transport.send(options);

      // Forward-only: a delivery webhook may have landed while the provider
      // call was in flight, and must not be regressed back to `sent`.
      await emailService
        .advanceEmailStatus(emailId, "sent", { resendId })
        .catch((error: unknown) => {
          this.logger.error(
            { emailId, error },
            "mail.queue.status_update_failed"
          );
        });

      this.logger.info({ emailId, resendId }, "mail.queue.sent");

      return { status: "sent", emailId, resendId };
    } catch (error) {
      // Only downgrade a mail that never reached the provider. If a webhook
      // already recorded it as sent or delivered, the send succeeded and this
      // failure is from a retry attempt; overwriting would lose that state.
      if (isStatusAdvance(email.status, "failed")) {
        await emailService
          .updateEmailById(emailId, { status: "failed" })
          .catch(() => undefined);
      } else {
        this.logger.warn(
          { emailId, status: email.status },
          "mail.queue.failure_ignored_already_sent"
        );
      }

      this.logger.error({ emailId, error }, "mail.queue.send_failed");

      throw error;
    }
  }

  async handleBatch(batch: MailQueueBatchLike): Promise<void> {
    for (const message of batch.messages) {
      try {
        await this.processMessage(message.body);
        message.ack();
      } catch (error) {
        this.logger.warn({ messageId: message.id, error }, "mail.queue.retry");
        message.retry();
      }
    }
  }
}
