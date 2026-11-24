import { API_MESSAGES } from "#/constants/apiMessage";
import { applyResendEvent } from "#/mail/resend";
import { createFileRoute } from "@tanstack/react-router";

import { createResendWebhookHandler } from "./-webhook.utils";

export const Route = createFileRoute("/api/mail/resend/outbound")({
  server: {
    handlers: {
      POST: createResendWebhookHandler(
        "RESEND_OUTBOUND_WEBHOOK_SECRET",
        async ({ event, emailService }) => {
          const outcome = await applyResendEvent(event, emailService);

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
