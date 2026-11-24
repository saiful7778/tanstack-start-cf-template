import type { EmailStatusEnumType } from "#/db/schemas/enums/zod-db-enums";

import { cleanMessageId } from "../mail.utils";
import type { EmailService } from "../services/email.service";
import type { ResendWebhookEvent } from "./resendWebhook.types";

/**
 * Delivery status reported by each webhook event.
 *
 * `email.received` is inbound (handled elsewhere), and the engagement events
 * (`opened`, `clicked`, `scheduled`) carry no status we store, so they map to
 * nothing and are acknowledged without a write.
 */
const EVENT_STATUS: Partial<
  Record<ResendWebhookEvent["type"], EmailStatusEnumType>
> = {
  "email.sent": "sent",
  "email.delivered": "delivered",
  "email.delivery_delayed": "delivery_delayed",
  "email.bounced": "bounced",
  "email.complained": "complained",
  "email.suppressed": "suppressed",
  "email.failed": "failed",
};

export interface ResendEventOutcome {
  /** False when the event carries no delivery status we record. */
  handled: boolean;
  emailId?: string;
  status?: EmailStatusEnumType;
  /** False when the stored status was already at or past this event's. */
  applied?: boolean;
}

function isDeliveryEvent(
  event: ResendWebhookEvent
): event is Extract<
  ResendWebhookEvent,
  { data: { email_id: string; message_id: string } }
> {
  return "email_id" in event.data && "message_id" in event.data;
}

/**
 * Apply a verified delivery event to the matching email record.
 *
 * Status only ever moves forward, so replayed or out-of-order events are
 * no-ops rather than regressions.
 */
export async function applyResendEvent(
  event: ResendWebhookEvent,
  emailService: EmailService
): Promise<ResendEventOutcome> {
  const status = EVENT_STATUS[event.type];

  if (!status || !isDeliveryEvent(event)) {
    return { handled: false };
  }

  const { email_id: resendId, message_id: messageId } = event.data;

  // Record the provider message id even when the status is already ahead: it
  // is what inbound replies are matched against for threading.
  await emailService.updateEmailByResendId(resendId, {
    resendMessageId: cleanMessageId(messageId),
  });

  const applied = await emailService.advanceEmailStatusByResendId(
    resendId,
    status
  );

  return { handled: true, emailId: resendId, status, applied };
}
