import { API_MESSAGES } from "#/constants/apiMessage";
import { ApiResponseJson } from "#/helpers/ApiResponseJson";
import { isServiceError } from "#/helpers/ServiceError";
import { db } from "#/lib/db.server";
import { env } from "#/lib/env";
import { MailError } from "#/mail/mail.error";
import { verifyResendWebhook } from "#/mail/resend";
import { EmailService } from "#/mail/services/email.service";

/** How a webhook route maps a signing secret onto the environment. */
export type ResendWebhookSecret =
  | "RESEND_EVENT_WEBHOOK_SECRET"
  | "RESEND_INBOUND_WEBHOOK_SECRET"
  | "RESEND_OUTBOUND_WEBHOOK_SECRET";

/** Statuses a route returns for an error that is worth retrying. */
const RETRYABLE = 500;

/**
 * Turn a thrown error into the route's JSON response.
 *
 * Anything carrying a 4xx is a permanent failure — a bad signature, an
 * unsupported event, a malformed payload — and must be answered with a 2xx so
 * Resend stops redelivering it. Provider outages and database failures stay
 * 5xx so the event is retried.
 *
 * `success` is always false here: an error was raised either way, and only the
 * HTTP status tells Resend whether to retry.
 */
export function toWebhookResponse(error: unknown) {
  if (isServiceError(error)) {
    const permanent = error.statusCode < RETRYABLE;

    return ApiResponseJson(
      false,
      error.message,
      { code: error.code, permanent },
      permanent ? 200 : error.statusCode
    );
  }

  return ApiResponseJson(
    false,
    error instanceof Error ? error.message : "Unknown webhook error",
    null,
    500
  );
}

/**
 * Verify the request signature against the secret for this endpoint.
 *
 * `request.text()` must be read exactly once and before any parsing: the
 * signature covers the raw bytes.
 */
export function verifyRequest(
  request: Request,
  payload: string,
  secretName: ResendWebhookSecret
) {
  const secret = env[secretName];

  if (!secret) {
    throw new MailError(
      API_MESSAGES.GENERAL.RESEND.SECRET_NOT_FOUND,
      "MAIL_WEBHOOK_UNAUTHORIZED",
      500,
      { secretName }
    );
  }

  return verifyResendWebhook(request.headers, payload, secret);
}

/** A verified event applied to storage, returning the response payload. */
export type WebhookApplier = (params: {
  event: ReturnType<typeof verifyResendWebhook>;
  emailService: EmailService;
  database: typeof db;
}) => Promise<{ message: string; data?: unknown }>;

/**
 * Build the `POST` handler every Resend webhook route uses.
 *
 * Keeping this in one place means signature verification, error mapping and
 * acknowledgement semantics cannot drift between the event, inbound and
 * outbound endpoints.
 */
export function createResendWebhookHandler(
  secretName: ResendWebhookSecret,
  apply: WebhookApplier
) {
  return async ({ request }: { request: Request }) => {
    try {
      const payload = await request.text();
      const event = verifyRequest(request, payload, secretName);

      const { message, data } = await apply({
        event,
        emailService: new EmailService(db),
        database: db,
      });

      return ApiResponseJson(true, message, data);
    } catch (error) {
      return toWebhookResponse(error);
    }
  };
}
