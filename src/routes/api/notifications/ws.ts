import { API_MESSAGES } from "#/constants/apiMessage";
import { getAuth } from "#/features/auth/auth.server";
import { NOTIFICATION_INTERNAL_ORIGIN } from "#/features/notification/notification.constants";
import { getNotificationStub } from "#/features/notification/server/notification.binding";
import { isAllowedNotificationOrigin } from "#/features/notification/server/notification.origin";
import { ApiResponseJson } from "#/helpers/ApiResponseJson";
import { env } from "#/lib/env";
import { createFileRoute } from "@tanstack/react-router";
import { env as workerEnv } from "cloudflare:workers";

export const Route = createFileRoute("/api/notifications/ws")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (request.headers.get("Upgrade") !== "websocket") {
          return new Response("Expected a WebSocket upgrade request", {
            status: 426,
          });
        }

        // The handshake is cookie-authenticated, so the origin has to be
        // checked before the session is trusted.
        const originAllowed = isAllowedNotificationOrigin({
          requestUrl: request.url,
          origin: request.headers.get("Origin"),
          siteUrl: env.VITE_SITE_URL,
        });

        if (!originAllowed) {
          return ApiResponseJson(
            false,
            API_MESSAGES.GENERAL.FORBIDDEN,
            null,
            403
          );
        }

        const session = await getAuth().api.getSession({
          headers: request.headers,
        });

        if (!session) {
          return ApiResponseJson(
            false,
            API_MESSAGES.GENERAL.UNAUTHORIZED,
            null,
            401
          );
        }

        const stub = getNotificationStub(workerEnv, session.user.id);

        return await stub.fetch(
          new Request(`${NOTIFICATION_INTERNAL_ORIGIN}/ws`, request)
        );
      },
    },
  },
});
