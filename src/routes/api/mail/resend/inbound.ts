import { API_MESSAGES } from "#/constants/apiMessage";
import { applyResendInboundEvent } from "#/mail/resend";
import { createFileRoute } from "@tanstack/react-router";

import { createResendWebhookHandler } from "./-webhook.utils";

export const Route = createFileRoute("/api/mail/resend/inbound")({
  server: {
    handlers: {
      POST: createResendWebhookHandler(
        "RESEND_INBOUND_WEBHOOK_SECRET",
        async ({ event, emailService, database }) => ({
          message: API_MESSAGES.GENERAL.RESEND.COMPLETED,
          data: await applyResendInboundEvent(event, emailService, database),
        })
      ),
    },
  },
});
