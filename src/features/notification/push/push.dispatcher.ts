import type { DatabaseType } from "#/db/clients/drizzle-client";
import { PushSubscriptionTable } from "#/db/schemas";
import { env } from "#/lib/env";
import { notificationLog } from "#/lib/logger.server";
import { eq } from "drizzle-orm";
import {
  sendNotification as sendWebPushNotification,
  WebPushError,
} from "web-push";

import type { NotificationDto } from "../notification.types";

/** Result of attempting push delivery for one notification. */
export interface PushDeliveryResult {
  /** Subscriptions the push service accepted. */
  delivered: number;
  /** Subscriptions removed because the endpoint is permanently gone. */
  pruned: number;
}

/**
 * Outbound push transport.
 *
 * Kept behind an interface so the notification service can orchestrate
 * delivery without importing `web-push` (which needs Node TLS) into every
 * module that constructs a service.
 */
export interface NotificationPushDispatcher {
  dispatch: (notification: NotificationDto) => Promise<PushDeliveryResult>;
}

interface VapidDetails {
  subject: string;
  publicKey: string;
  privateKey: string;
}

/**
 * VAPID keys are optional at the environment level, so they are resolved where
 * push is actually attempted rather than failing the whole app at boot.
 */
function readVapidDetails(): VapidDetails | null {
  const publicKey = env.VITE_WEB_PUSH_PUBLIC_KEY;
  const privateKey = env.WEB_PUSH_PRIVATE_KEY;

  if (!publicKey || !privateKey) return null;

  return {
    subject: `mailto:${env.VITE_SUPPORT_MAIL}`,
    publicKey,
    privateKey,
  };
}

/** A dispatcher that never sends anything, for deployments without push. */
export const noopPushDispatcher: NotificationPushDispatcher = {
  dispatch: async () => ({ delivered: 0, pruned: 0 }),
};

/**
 * Web Push over VAPID.
 *
 * Registrations the push service reports as gone (404/410) are deleted: they
 * would fail on every future send.
 */
export function createWebPushDispatcher(
  database: DatabaseType
): NotificationPushDispatcher {
  return {
    async dispatch(notification) {
      const vapidDetails = readVapidDetails();

      if (!vapidDetails) {
        // Push is optional: the notification is still stored and delivered
        // in-app, it just cannot reach the device.
        notificationLog.warn("notification.push.skipped_no_vapid_keys");
        return { delivered: 0, pruned: 0 };
      }

      const subscriptions = await database
        .select({
          endpoint: PushSubscriptionTable.endpoint,
          p256dh: PushSubscriptionTable.p256dh,
          auth: PushSubscriptionTable.auth,
          expirationTime: PushSubscriptionTable.expirationTime,
        })
        .from(PushSubscriptionTable)
        .where(eq(PushSubscriptionTable.userId, notification.recipientId));

      const outcomes = await Promise.all(
        subscriptions.map(async (subscription) => {
          try {
            await sendWebPushNotification(
              {
                endpoint: subscription.endpoint,
                keys: {
                  p256dh: subscription.p256dh,
                  auth: subscription.auth,
                },
                expirationTime: subscription.expirationTime,
              },
              JSON.stringify(notification),
              { TTL: 60 * 60, vapidDetails }
            );

            return "delivered" as const;
          } catch (error) {
            notificationLog.error(
              { endpoint: subscription.endpoint, err: error },
              "notification.push.failed"
            );

            if (
              error instanceof WebPushError &&
              (error.statusCode === 410 || error.statusCode === 404)
            ) {
              await database
                .delete(PushSubscriptionTable)
                .where(
                  eq(PushSubscriptionTable.endpoint, subscription.endpoint)
                );

              return "pruned" as const;
            }

            return "failed" as const;
          }
        })
      );

      return {
        delivered: outcomes.filter((outcome) => outcome === "delivered").length,
        pruned: outcomes.filter((outcome) => outcome === "pruned").length,
      };
    },
  };
}
