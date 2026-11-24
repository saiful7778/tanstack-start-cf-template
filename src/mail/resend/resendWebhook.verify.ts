import { API_MESSAGES } from "#/constants/apiMessage";
import { Webhook, WebhookVerificationError } from "standardwebhooks";

import { MailError } from "../mail.error";
import type { ResendWebhookEvent } from "./resendWebhook.types";

const SIGNATURE_HEADERS = {
  id: "svix-id",
  timestamp: "svix-timestamp",
  signature: "svix-signature",
} as const;

/**
 * Verify a Resend webhook signature and return the parsed event.
 *
 * Verification is a plain HMAC over `id.timestamp.payload` with the webhook's
 * signing secret, so it neither needs nor may rely on `RESEND_API_KEY`:
 * `standardwebhooks` is used directly rather than the Resend SDK, whose client
 * cannot be constructed without an API key.
 *
 * Every failure — missing secret, missing headers, bad signature, stale
 * timestamp, malformed JSON — is reported as a {@link MailError} carrying a 4xx
 * status, so the route returns a permanent failure and Resend stops retrying.
 */
export function verifyResendWebhook(
  headers: Headers,
  payload: string,
  webhookSecret: string | undefined
): ResendWebhookEvent {
  if (!webhookSecret) {
    throw new MailError(
      API_MESSAGES.GENERAL.RESEND.SECRET_NOT_FOUND,
      "MAIL_WEBHOOK_UNAUTHORIZED",
      500
    );
  }

  const id = headers.get(SIGNATURE_HEADERS.id);
  const timestamp = headers.get(SIGNATURE_HEADERS.timestamp);
  const signature = headers.get(SIGNATURE_HEADERS.signature);

  if (!id || !timestamp || !signature) {
    throw new MailError(
      API_MESSAGES.GENERAL.RESEND.BAD_REQUEST,
      "MAIL_WEBHOOK_UNAUTHORIZED",
      401,
      { missingHeaders: true }
    );
  }

  try {
    // The signature is checked before the payload is parsed, so decoding the
    // JSON here cannot run untrusted data through `JSON.parse` early.
    return new Webhook(webhookSecret).verify(payload, {
      "webhook-id": id,
      "webhook-timestamp": timestamp,
      "webhook-signature": signature,
    }) as ResendWebhookEvent;
  } catch (error) {
    if (error instanceof WebhookVerificationError) {
      throw new MailError(
        API_MESSAGES.GENERAL.RESEND.BAD_REQUEST,
        "MAIL_WEBHOOK_UNAUTHORIZED",
        401,
        { reason: error.message }
      );
    }

    throw new MailError(
      API_MESSAGES.GENERAL.RESEND.BAD_REQUEST,
      "MAIL_WEBHOOK_UNAUTHORIZED",
      401,
      { reason: error instanceof Error ? error.message : "Unknown error" }
    );
  }
}
