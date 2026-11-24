import type { WebhookEventPayload } from "resend";

/** A webhook event after its signature has been verified. */
export type ResendWebhookEvent = WebhookEventPayload;

/** Event types whose `data` carries the sent email's identifiers. */
export type ResendEmailEventType = Extract<
  ResendWebhookEvent,
  { data: { email_id: string } }
>["type"];
