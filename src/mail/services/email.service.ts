import type { DatabaseType } from "#/db/clients/drizzle-client";
import {
  EmailAttachmentTable,
  EmailRecipientTable,
  EmailTable,
  type InsertEmailAttachment,
  type InsertEmailRecipient,
  type SelectEmail,
  type UpdateEmail,
} from "#/db/schemas";
import type { EmailStatusEnumType } from "#/db/schemas/enums/zod-db-enums";
import { and, eq, notInArray, type SQL } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import type { InboundEmailPayload } from "../inboundEmail.types";
import { MailError } from "../mail.error";
import { statusesAtOrAbove } from "../mailStatus";
import type {
  MailAttachment,
  SendMailOption,
} from "../transport/mailTransport.types";

/** Recipient kinds persisted in {@link EmailRecipientTable}. */
type RecipientType = "from" | "to" | "cc" | "bcc" | "reply_to" | "received_for";

export interface RecipientInfo {
  email: string;
  name?: string;
}

export interface IEmailService {
  normalizeRecipient: (recipient: string) => RecipientInfo;
  normalizeRecipients: (
    recipients: string | string[] | null | undefined
  ) => RecipientInfo[];
  extractPrimaryRecipient: (to: string | string[]) => RecipientInfo;
  buildOutboundEmailOptions: (emailId: string) => Promise<SendMailOption>;
  getEmailById: (
    id: string,
    database?: DatabaseType
  ) => Promise<SelectEmail | undefined>;
  createInboundEmailRecord: (
    params: InboundEmailPayload & {
      threadId?: string | undefined;
    },
    database?: DatabaseType
  ) => Promise<{
    emailId: string;
    /** True when the provider message was already stored (webhook replay). */
    duplicate: boolean;
  }>;
  getEmailByResendId: (
    resendId: string,
    database?: DatabaseType
  ) => Promise<SelectEmail | undefined>;
  advanceEmailStatus: (
    emailId: string,
    status: EmailStatusEnumType,
    params?: UpdateEmail,
    database?: DatabaseType
  ) => Promise<boolean>;
  advanceEmailStatusByResendId: (
    resendId: string,
    status: EmailStatusEnumType,
    params?: UpdateEmail,
    database?: DatabaseType
  ) => Promise<boolean>;
  updateEmailByResendId: (
    resendId: string,
    params: UpdateEmail,
    database?: DatabaseType
  ) => Promise<void>;
  updateEmailById: (
    id: string,
    params: UpdateEmail,
    database?: DatabaseType
  ) => Promise<void>;
}

export class EmailService implements IEmailService {
  constructor(private readonly database: DatabaseType) {}

  private resolveDB(database?: DatabaseType): DatabaseType {
    return database ?? this.database;
  }

  /**
   * Run a database operation and surface infrastructure failures as a
   * {@link MailError} so callers can handle them by code.
   */
  private async runDbOperation<T>(
    operation: () => PromiseLike<T>,
    metadata: Record<string, unknown>
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof MailError) throw error;

      throw new MailError(
        error instanceof Error
          ? error.message
          : "Mail database operation failed",
        "MAIL_PERSISTENCE_FAILED",
        500,
        metadata
      );
    }
  }

  public normalizeRecipient(recipient: string): RecipientInfo {
    const match = recipient.match(/^"?([^"]+)"?\s*<([^>]+)>$/);
    if (match) {
      const name = match[1]?.trim();
      const email = match[2]?.trim().toLowerCase();
      if (!email) {
        throw new MailError(
          "Failed to parse 'email'",
          "MAIL_RECIPIENT_INVALID",
          400,
          { recipient }
        );
      }
      return { name, email };
    }
    return { email: recipient.trim().toLowerCase() };
  }

  public normalizeRecipients(
    recipients: string | string[] | null | undefined
  ): RecipientInfo[] {
    if (!recipients) return [];
    if (Array.isArray(recipients)) {
      return recipients.map(this.normalizeRecipient);
    }
    return [this.normalizeRecipient(recipients)];
  }

  public extractPrimaryRecipient(to: string | string[]): RecipientInfo {
    const recipients = this.normalizeRecipients(to);
    const recipient = recipients[0];
    if (!recipient) {
      throw new MailError(
        "No valid recipient provided",
        "MAIL_RECIPIENT_INVALID",
        400,
        { to }
      );
    }
    return recipient;
  }

  public async createOutboundEmailRecord(
    params: {
      options: SendMailOption;
      threadId: string | undefined;
      status?: string;
    },
    database?: DatabaseType
  ): Promise<{ emailId: string; threadId: string | undefined }> {
    const db = this.resolveDB(database);
    const { options, threadId } = params;

    // D1 does not support interactive transactions (BEGIN/COMMIT). Generate the
    // id eagerly so child rows can reference it, then persist everything in an
    // atomic `db.batch()`.
    const emailId = crypto.randomUUID();

    const fromRecipient = this.normalizeRecipient(options.from);
    const recipients = this.normalizeRecipients(options.to);
    const ccRecipients = this.normalizeRecipients(options.cc);
    const bccRecipients = this.normalizeRecipients(options.bcc);
    const replyToRecipients = this.normalizeRecipients(options.replyTo);

    const metadata = this.buildOutboundMetadata(options);

    const recipientRows: InsertEmailRecipient[] = [
      {
        emailId,
        type: "from" as const,
        email: fromRecipient.email,
        name: fromRecipient.name,
      },
      ...recipients.map((r) => ({
        emailId,
        type: "to" as const,
        email: r.email,
        name: r.name,
      })),
      ...ccRecipients.map((r) => ({
        emailId,
        type: "cc" as const,
        email: r.email,
        name: r.name,
      })),
      ...bccRecipients.map((r) => ({
        emailId,
        type: "bcc" as const,
        email: r.email,
        name: r.name,
      })),
      ...replyToRecipients.map((r) => ({
        emailId,
        type: "reply_to" as const,
        email: r.email,
        name: r.name,
      })),
    ];

    const statements: [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]] = [
      db.insert(EmailTable).values({
        id: emailId,
        threadId,
        direction: "outbound",
        status: "queued",
        subject: options.subject,
        textBody: options.text,
        htmlBody: options.html,
        headers: options.headers,
        metadata,
      }),
    ];

    if (recipientRows.length > 0) {
      statements.push(db.insert(EmailRecipientTable).values(recipientRows));
    }

    if (options.attachments?.length) {
      statements.push(
        db.insert(EmailAttachmentTable).values(
          options.attachments.map(
            (a) =>
              ({
                emailId,
                filename: `${a.filename}`,
                contentType: `${a.contentType}`,
                contentId: a.contentId,
                url: a.path,
              }) satisfies InsertEmailAttachment
          )
        )
      );
    }

    await this.runDbOperation(() => db.batch(statements), { emailId });

    return { emailId, threadId };
  }

  /** Persist the send options that are not already covered by table columns. */
  private buildOutboundMetadata(
    options: SendMailOption
  ): Record<string, unknown> | undefined {
    const metadata: Record<string, unknown> = {};

    if (options.tags) metadata.tags = options.tags;
    if (options.topicId) metadata.topicId = options.topicId;
    if (options.scheduledAt) metadata.scheduledAt = options.scheduledAt;

    return Object.keys(metadata).length > 0 ? metadata : undefined;
  }

  /** Format a persisted recipient back into an RFC 5322 address. */
  private formatAddress(recipient: {
    email: string;
    name: string | null;
  }): string {
    return recipient.name
      ? `${recipient.name} <${recipient.email}>`
      : recipient.email;
  }

  /**
   * Rebuild the transport-neutral send options for an outbound email from its
   * persisted record. Used by the queue consumer to send a mail without
   * embedding its content in the queued message.
   */
  public async buildOutboundEmailOptions(
    emailId: string
  ): Promise<SendMailOption> {
    const [email] = await this.runDbOperation(
      () =>
        this.database
          .select({
            subject: EmailTable.subject,
            textBody: EmailTable.textBody,
            htmlBody: EmailTable.htmlBody,
            headers: EmailTable.headers,
            metadata: EmailTable.metadata,
          })
          .from(EmailTable)
          .where(eq(EmailTable.id, emailId))
          .limit(1),
      { emailId }
    );

    if (!email) {
      throw new MailError(
        `Outbound email not found: ${emailId}`,
        "MAIL_EMAIL_NOT_FOUND",
        404,
        { emailId }
      );
    }

    const [recipients, attachments] = await Promise.all([
      this.runDbOperation(
        () =>
          this.database
            .select()
            .from(EmailRecipientTable)
            .where(eq(EmailRecipientTable.emailId, emailId)),
        { emailId }
      ),
      this.runDbOperation(
        () =>
          this.database
            .select()
            .from(EmailAttachmentTable)
            .where(eq(EmailAttachmentTable.emailId, emailId)),
        { emailId }
      ),
    ]);

    const byType = (type: RecipientType) =>
      recipients
        .filter((r) => r.type === type)
        .map((r) => this.formatAddress(r));

    const from = byType("from")[0];
    if (!from) {
      throw new MailError(
        `Outbound email ${emailId} has no sender`,
        "MAIL_INVALID_PAYLOAD",
        422,
        { emailId }
      );
    }

    const to = byType("to");
    const cc = byType("cc");
    const bcc = byType("bcc");
    const replyTo = byType("reply_to");
    const metadata = email.metadata ?? {};

    return {
      from,
      to,
      cc: cc.length > 0 ? cc : undefined,
      bcc: bcc.length > 0 ? bcc : undefined,
      replyTo: replyTo.length > 0 ? replyTo : undefined,
      subject: email.subject ?? "",
      text: email.textBody ?? undefined,
      html: email.htmlBody ?? undefined,
      headers: email.headers ?? undefined,
      attachments:
        attachments.length > 0
          ? attachments.map((a): MailAttachment => ({
              filename: a.filename,
              contentType: a.contentType,
              contentId: a.contentId ?? undefined,
              path: a.url ?? undefined,
            }))
          : undefined,
      tags: metadata.tags as SendMailOption["tags"],
      topicId: (metadata.topicId as string | undefined) ?? undefined,
      scheduledAt: metadata.scheduledAt as string | undefined,
    };
  }

  public async getEmailById(
    id: string,
    database?: DatabaseType
  ): Promise<SelectEmail | undefined> {
    const db = this.resolveDB(database);

    const [email] = await this.runDbOperation(
      () => db.select().from(EmailTable).where(eq(EmailTable.id, id)).limit(1),
      { emailId: id }
    );

    return email;
  }

  public async createInboundEmailRecord(
    params: InboundEmailPayload & {
      threadId?: string | undefined;
    },
    database?: DatabaseType
  ): Promise<{ emailId: string; duplicate: boolean }> {
    const db = this.resolveDB(database);

    // Resend retries webhooks, so the same provider message can arrive more
    // than once. `resendId` is unique, and re-inserting would fail the batch
    // and trigger yet another retry, so an existing record is returned as-is.
    const existing = await this.getEmailByResendId(params.id, db);

    if (existing) {
      return { emailId: existing.id, duplicate: true };
    }

    // D1 does not support interactive transactions (BEGIN/COMMIT). Generate the
    // id eagerly so child rows can reference it, then persist everything in an
    // atomic `db.batch()`.
    const emailId = crypto.randomUUID();

    const fromRecipient = this.normalizeRecipient(params.from);
    const recipients = this.normalizeRecipients(params.to);
    const ccRecipients = this.normalizeRecipients(params.cc);
    const bccRecipients = this.normalizeRecipients(params.bcc);
    const replyToRecipients = this.normalizeRecipients(params.reply_to);
    const receivedForRecipients = this.normalizeRecipients(params.received_for);

    const recipientRows: InsertEmailRecipient[] = [
      {
        emailId,
        type: "from" as const,
        email: fromRecipient.email,
        name: fromRecipient.name,
      },
      ...recipients.map((r) => ({
        emailId,
        type: "to" as const,
        email: r.email,
        name: r.name,
      })),
      ...ccRecipients.map((r) => ({
        emailId,
        type: "cc" as const,
        email: r.email,
        name: r.name,
      })),
      ...bccRecipients.map((r) => ({
        emailId,
        type: "bcc" as const,
        email: r.email,
        name: r.name,
      })),
      ...replyToRecipients.map((r) => ({
        emailId,
        type: "reply_to" as const,
        email: r.email,
        name: r.name,
      })),
      ...receivedForRecipients.map((r) => ({
        emailId,
        type: "received_for" as const,
        email: r.email,
        name: r.name,
      })),
    ];

    const statements: [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]] = [
      db.insert(EmailTable).values({
        id: emailId,
        threadId: params.threadId,
        direction: "inbound",
        status: "received",
        subject: params.subject,
        textBody: params.text,
        htmlBody: params.html,
        headers: params.headers,
        resendId: params.id,
        resendMessageId: params.message_id,
      }),
    ];

    if (recipientRows.length > 0) {
      statements.push(db.insert(EmailRecipientTable).values(recipientRows));
    }

    if (params.attachments.length > 0) {
      statements.push(
        db.insert(EmailAttachmentTable).values(
          params.attachments.map(
            (a) =>
              ({
                emailId,
                filename: `${a.filename}`,
                contentType: a.content_type,
                contentId: a.content_id,
                contentDisposition: a.content_disposition,
                size: a.size,
              }) satisfies InsertEmailAttachment
          )
        )
      );
    }

    await this.runDbOperation(() => db.batch(statements), { emailId });

    return { emailId, duplicate: false };
  }

  public async getEmailByResendId(
    resendId: string,
    database?: DatabaseType
  ): Promise<SelectEmail | undefined> {
    const db = this.resolveDB(database);

    const [email] = await this.runDbOperation(
      () =>
        db
          .select()
          .from(EmailTable)
          .where(eq(EmailTable.resendId, resendId))
          .limit(1),
      { resendId }
    );

    return email;
  }

  /**
   * Apply a webhook-reported status only if it moves the email forward.
   *
   * The guard lives in the `WHERE` clause so concurrent deliveries cannot both
   * decide to write: the loser matches no row. Returns whether a row changed.
   */
  public async advanceEmailStatus(
    emailId: string,
    status: EmailStatusEnumType,
    params: UpdateEmail = {},
    database?: DatabaseType
  ): Promise<boolean> {
    return this.advanceStatusWhere(
      eq(EmailTable.id, emailId),
      status,
      params,
      database
    );
  }

  /**
   * Same forward-only guard as {@link advanceEmailStatus}, keyed on the
   * provider's id instead of the local one.
   */
  public async advanceEmailStatusByResendId(
    resendId: string,
    status: EmailStatusEnumType,
    params: UpdateEmail = {},
    database?: DatabaseType
  ): Promise<boolean> {
    return this.advanceStatusWhere(
      eq(EmailTable.resendId, resendId),
      status,
      params,
      database
    );
  }

  private async advanceStatusWhere(
    match: SQL,
    status: EmailStatusEnumType,
    params: UpdateEmail,
    database?: DatabaseType
  ): Promise<boolean> {
    const db = this.resolveDB(database);
    // Current statuses this event must not overwrite: the target itself and
    // everything at or past it, which makes replays a no-op.
    const alreadyReached = statusesAtOrAbove(status);

    const changed = await this.runDbOperation(
      () =>
        db
          .update(EmailTable)
          .set({ ...params, status })
          .where(and(match, notInArray(EmailTable.status, alreadyReached)))
          .returning({ id: EmailTable.id }),
      { status }
    );

    return changed.length > 0;
  }

  public async updateEmailByResendId(
    resendId: string,
    params: UpdateEmail,
    database?: DatabaseType
  ): Promise<void> {
    const db = this.resolveDB(database);

    await this.runDbOperation(
      () =>
        db
          .update(EmailTable)
          .set(params)
          .where(eq(EmailTable.resendId, resendId)),
      { resendId }
    );
  }

  public async updateEmailById(
    id: string,
    params: UpdateEmail,
    database?: DatabaseType
  ): Promise<void> {
    const db = this.resolveDB(database);

    await this.runDbOperation(
      () => db.update(EmailTable).set(params).where(eq(EmailTable.id, id)),
      { emailId: id }
    );
  }
}
