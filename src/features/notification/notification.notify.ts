import type { DatabaseType } from "#/db/clients/drizzle-client";
import type { NotificationCategoryEnumType } from "#/db/schemas/enums/zod-db-enums";
import { notificationLog } from "#/lib/logger.server";

import type { DeliveryReport } from "./delivery/delivery.orchestrator";
import type { CreateNotificationInput } from "./notification.types";
import { sendNotification } from "./push/sendNotification";

/**
 * How long a side-effect notification may take before it is abandoned.
 *
 * These run inside a request the user is waiting on, so the budget is short:
 * a slow push endpoint must not make "Ban user" feel broken. The row is already
 * committed, so an abandoned delivery is not lost work — the user sees the
 * notification on their next fetch, and the admin action still succeeds.
 */
const SIDE_EFFECT_TIMEOUT_MS = 3_000;

export interface NotifyUserInput {
  database: DatabaseType;
  recipientId: string;
  /** Who caused this, for the notification's audit trail. */
  actorId?: string | null;
  category: NotificationCategoryEnumType;
  level: "INFO" | "SUCCESS" | "WARNING" | "ERROR";
  title: string;
  message: string;
  /** Contextual payload, e.g. `{ reason }` or `{ previousRole }`. */
  data?: Record<string, unknown> | null;
}

/**
 * Send a notification as a side effect of a user-initiated action.
 *
 * ## Why this exists
 *
 * Admin actions (ban, role change) must succeed even when notification delivery
 * fails — the database change is the point, the notification is a courtesy.
 * This wrapper enforces that in one place instead of relying on every procedure
 * to remember it:
 *
 * - **Never throws.** Any failure is logged and swallowed.
 * - **Bounded.** Delivery gets a short budget so a hung transport cannot stall
 *   the request.
 * - **Awaited, not fire-and-forget.** The oRPC context has no `waitUntil`, so a
 *   floating promise could be killed when the response is sent. Awaiting a
 *   bounded operation is the honest choice: the notification either lands
 *   before the response or is logged as abandoned.
 */
export async function notifyUser({
  database,
  recipientId,
  actorId = null,
  category,
  level,
  title,
  message,
  data = null,
}: NotifyUserInput): Promise<DeliveryReport | null> {
  // Notifying yourself about your own action is noise.
  if (actorId && actorId === recipientId) return null;

  const payload: CreateNotificationInput = {
    recipientId,
    actorId,
    category,
    level,
    title,
    message,
    data,
  };

  try {
    const { delivery } = await withDeadline(
      sendNotification({ database, payload }),
      SIDE_EFFECT_TIMEOUT_MS
    );

    if (!delivery.delivered) {
      notificationLog.warn(
        {
          recipientId,
          category,
          inApp: delivery.inApp.outcome,
          push: delivery.push.outcome,
          email: delivery.email.outcome,
        },
        "notification.side_effect.undelivered"
      );
    }

    return delivery;
  } catch (error) {
    notificationLog.error(
      { recipientId, category, err: error },
      "notification.side_effect.failed"
    );

    return null;
  }
}

/**
 * Resolve or reject after `timeoutMs`.
 *
 * Separate from the orchestrator's per-channel timeout: this bounds the whole
 * operation, including the settings read and the insert.
 */
function withDeadline<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_resolve, reject) => {
      setTimeout(
        () => reject(new Error(`Notification exceeded ${timeoutMs}ms`)),
        timeoutMs
      );
    }),
  ]);
}
