import type { DatabaseType } from "#/db/clients/drizzle-client";
import { EmailTable } from "#/db/schemas";
import { asc, eq, inArray } from "drizzle-orm";

import type { InboundEmailPayload } from "../inboundEmail.types";
import { MailError } from "../mail.error";
import { cleanMessageId } from "../mail.utils";
import type { EmailService } from "../services/email.service";
import { getResendClient } from "./resendClient";
import type { ResendWebhookEvent } from "./resendWebhook.types";

/**
 * Find the thread an inbound message belongs to by walking the standard
 * `In-Reply-To` and `References` headers back to an email we already stored.
 */
export async function resolveInboundThreadId(
  database: DatabaseType,
  payload: InboundEmailPayload
): Promise<string | undefined> {
  const inReplyTo = payload.headers?.["in-reply-to"];

  if (inReplyTo) {
    const [originalEmail] = await database
      .select({ threadId: EmailTable.threadId })
      .from(EmailTable)
      .where(eq(EmailTable.resendMessageId, cleanMessageId(inReplyTo)))
      .limit(1);

    if (originalEmail?.threadId) return originalEmail.threadId;
  }

  const references = payload.headers?.references;

  if (!references) return undefined;

  const referenceIds = references
    .split(/\s+/)
    .map(cleanMessageId)
    .filter(Boolean);

  if (referenceIds.length === 0) return undefined;

  const [email] = await database
    .select({ threadId: EmailTable.threadId })
    .from(EmailTable)
    .where(inArray(EmailTable.resendMessageId, referenceIds))
    .orderBy(asc(EmailTable.createdAt))
    .limit(1);

  return email?.threadId ?? undefined;
}

export interface ResendInboundOutcome {
  emailId: string;
  threadId: string | undefined;
  duplicate: boolean;
}

/**
 * Store a verified `email.received` event.
 *
 * The webhook only carries metadata, so the full message body is fetched from
 * the Resend API. Retrieval failures are retryable and surface as 5xx; storage
 * is idempotent, so a redelivered event does not create a second record.
 */
export async function applyResendInboundEvent(
  event: ResendWebhookEvent,
  emailService: EmailService,
  database: DatabaseType
): Promise<ResendInboundOutcome> {
  if (!("email_id" in event.data)) {
    throw new MailError(
      "Inbound webhook event has no email id.",
      "MAIL_INVALID_PAYLOAD",
      400
    );
  }

  const response = await getResendClient().emails.receiving.get(
    event.data.email_id
  );

  if (response.error) {
    throw new MailError(response.error.message, "MAIL_TRANSPORT_FAILED", 502, {
      name: response.error.name,
    });
  }

  const data = response.data;

  const threadId = await resolveInboundThreadId(database, data);
  const { emailId, duplicate } = await emailService.createInboundEmailRecord(
    { ...data, message_id: cleanMessageId(data.message_id), threadId },
    database
  );

  return { emailId, threadId, duplicate };
}
