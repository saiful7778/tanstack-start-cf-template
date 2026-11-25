import { NOTIFICATION_INTERNAL_ORIGIN } from "../notification.constants";
import { NotificationError } from "../notification.error";
import {
  notificationEventSchema,
  type NotificationEvent,
} from "../notification.types";

export interface NotificationHub {
  publish: (event: NotificationEvent) => Promise<{ delivered: number }>;
  unreadCount: () => Promise<number>;
}

/** Resolve the durable object that owns a recipient's live connections. */
export function getNotificationStub(env: Env, recipientId: string) {
  return env.NOTIFICATIONS.get(env.NOTIFICATIONS.idFromName(recipientId));
}

/**
 * Bind a recipient's durable object to a small client the service can use.
 *
 * The durable object is internal: every call goes through a named stub, never
 * through a public route.
 */
export function bindNotificationHub(
  env: Env,
  recipientId: string
): NotificationHub {
  const stub = getNotificationStub(env, recipientId);

  return {
    async publish(event) {
      const parsed = notificationEventSchema.parse(event);

      const response = await stub.fetch(
        `${NOTIFICATION_INTERNAL_ORIGIN}/broadcast`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(parsed),
        }
      );

      if (!response.ok) {
        throw new NotificationError(
          "Failed to publish the notification event",
          "NOTIFICATION_PUBLISH_FAILED",
          response.status
        );
      }

      return await response.json<{ delivered: number }>();
    },

    async unreadCount() {
      const response = await stub.fetch(
        `${NOTIFICATION_INTERNAL_ORIGIN}/unread-count`
      );

      if (!response.ok) {
        throw new NotificationError(
          "Failed to read the unread notification count",
          "NOTIFICATION_UNREAD_COUNT_FAILED",
          response.status
        );
      }

      const { count } = await response.json<{ count: number }>();

      return count;
    },
  };
}
