import { API_MESSAGES } from "#/constants/apiMessage";
import { applyResendEvent } from "#/mail/resend";
import { createFileRoute } from "@tanstack/react-router";

import { createResendWebhookHandler } from "./-webhook.utils";

export const Route = createFileRoute("/api/mail/resend/event")({
  server: {
    handlers: {
      POST: createResendWebhookHandler(
        "RESEND_EVENT_WEBHOOK_SECRET",
        async ({ event, emailService }) => {
          const outcome = await applyResendEvent(event, emailService);

          // Events without a status we record (opens, clicks, contact changes)
          // are acknowledged, not rejected: a non-2xx makes Resend retry the
          // same event forever.
          return {
            message: outcome.handled
              ? API_MESSAGES.GENERAL.RESEND.COMPLETED
              : API_MESSAGES.GENERAL.RESEND.IGNORED,
            data: outcome,
          };
        }
      ),
    },
  },
});
