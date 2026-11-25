import { env } from "cloudflare:workers";

import {
  bindNotificationHub,
  type NotificationHub,
} from "./notification.binding";

export type { NotificationHub };

/** Resolve a recipient's live hub, e.g. for injection in tests. */
export type NotificationHubSource = (recipientId: string) => NotificationHub;

/**
 * Resolve the live hub for a recipient.
 *
 * The worker env is read from `cloudflare:workers` so the resolver can be used
 * from anywhere on the server, including oRPC procedures that only receive the
 * database through their context.
 */
export const notificationHubFor: NotificationHubSource = (recipientId) =>
  bindNotificationHub(env, recipientId);
