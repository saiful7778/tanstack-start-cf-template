import { env } from "#/lib/env";
import { Resend } from "resend";

import { MailError } from "../mail.error";

let client: Resend | undefined;

/**
 * Resolve the Resend client on demand.
 *
 * `new Resend(undefined)` throws, and Resend is optional here (SMTP-only
 * deployments set no API key), so the client must never be built at module
 * scope. Callers that genuinely need the API — inbound mail retrieval — get a
 * clear error instead of an import-time crash.
 */
export function getResendClient(): Resend {
  if (client) return client;

  const apiKey = env.RESEND_API_KEY?.trim();

  if (!apiKey) {
    throw new MailError(
      "RESEND_API_KEY is required to call the Resend API.",
      "MAIL_TRANSPORT_FAILED",
      500
    );
  }

  client = new Resend(
    apiKey,
    env.RESEND_BASE_URL ? { baseUrl: env.RESEND_BASE_URL } : undefined
  );

  return client;
}
