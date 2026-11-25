import {
  createDrizzleClient,
  type DatabaseType,
} from "#/db/clients/drizzle-client";
import {
  NotificationSettingsTable,
  NotificationTable,
  type NotificationDataModel,
} from "#/db/schemas";
import { notificationLog } from "#/lib/logger.server";
import { mail } from "#/lib/mail.server";
import { and, count, eq, inArray } from "drizzle-orm";

import {
  deliverNotification,
  type DeliveryReport,
} from "../delivery/delivery.orchestrator";
import {
  createNotificationEmailDispatcher,
  noopEmailDispatcher,
  type NotificationEmailDispatcher,
} from "../email/notification.email";
import { NotificationError } from "../notification.error";
import {
  createNotificationInputSchema,
  type CreateNotificationInput,
  type NotificationDto,
  type NotificationEvent,
} from "../notification.types";
import {
  createWebPushDispatcher,
  noopPushDispatcher,
  type NotificationPushDispatcher,
} from "../push/push.dispatcher";
import { bindNotificationHub } from "./notification.binding";
import type { NotificationHubSource } from "./notification.hub.server";

export function toNotificationDto(
  notification: NotificationDataModel
): NotificationDto {
  return {
    id: notification.id,
    recipientId: notification.recipientId,
    actorId: notification.actorId,
    category: notification.category,
    level: notification.level,
    title: notification.title,
    message: notification.message,
    data:
      (notification.data as Record<string, unknown> | null | undefined) ?? null,
    isRead: notification.isRead,
    readAt: notification.readAt?.toISOString() ?? null,
    isArchived: notification.isArchived,
    createdAt: notification.createdAt.toISOString(),
    updatedAt: notification.updatedAt.toISOString(),
  };
}

/** Notification channels a caller may attempt. */
export interface NotificationChannels {
  inApp: boolean;
  push: boolean;
  email: boolean;
}

export interface CreateNotificationOptions {
  /**
   * Override the channels applied from the recipient's settings.
   *
   * Omit to honour `notification_settings` (the default). Pass an explicit set
   * to force a channel — e.g. a security alert that must always be in-app.
   */
  channels?: NotificationChannels;
}

export interface CreateNotificationResult {
  /** `null` when every channel was disabled, so nothing was stored. */
  notification: NotificationDto | null;
  channels: NotificationChannels;
  /**
   * Per-channel delivery outcome, including timing and skip/failure reasons.
   *
   * Present even when `notification` is `null`, so a caller can see that every
   * channel was disabled rather than inferring it from the absence of a row.
   */
  delivery: DeliveryReport;
}

export interface NotificationServiceDependencies {
  push?: NotificationPushDispatcher;
  email?: NotificationEmailDispatcher;
}

const NO_CHANNELS: NotificationChannels = {
  inApp: false,
  push: false,
  email: false,
};

/**
 * Stand-in used only to produce a uniform report when every channel is
 * disabled. It is never persisted or delivered.
 */
const DISABLED_NOTIFICATION: NotificationDto = {
  id: "00000000-0000-0000-0000-000000000000",
  recipientId: "00000000-0000-0000-0000-000000000000",
  actorId: null,
  category: "SYSTEM",
  level: "INFO",
  title: "",
  message: "",
  data: null,
  isRead: false,
  readAt: null,
  isArchived: false,
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
};

/**
 * The server-side write path for notifications.
 *
 * D1 is the source of truth; the durable object only carries live updates, and
 * Web Push is one extra delivery channel. Both deliveries are best-effort: the
 * row is committed first, so a dead socket or an unreachable push service can
 * never roll back or fail the write.
 */
export class NotificationService {
  private readonly push: NotificationPushDispatcher;
  private readonly email: NotificationEmailDispatcher;

  constructor(
    private readonly database: DatabaseType,
    private readonly hubFor: NotificationHubSource,
    dependencies: NotificationServiceDependencies = {}
  ) {
    this.push = dependencies.push ?? noopPushDispatcher;
    this.email = dependencies.email ?? noopEmailDispatcher;
  }

  async create(
    input: CreateNotificationInput,
    { channels }: CreateNotificationOptions = {}
  ): Promise<NotificationDto | null> {
    return (await this.createWithResult(input, { channels })).notification;
  }

  /**
   * Create a notification and report how each channel fared.
   *
   * Callers that need delivery telemetry (queues, webhook handlers) use this;
   * callers that just want the row use {@link create}.
   *
   * The row is committed before delivery is attempted, and delivery never
   * throws: see {@link deliverNotification} for the algorithm.
   */
  async createWithResult(
    input: CreateNotificationInput,
    { channels: override }: CreateNotificationOptions = {}
  ): Promise<CreateNotificationResult> {
    const values = createNotificationInputSchema.parse(input);
    const channels = override ?? (await this.resolveChannels(values));

    if (!channels.inApp && !channels.push && !channels.email) {
      return {
        notification: null,
        channels: NO_CHANNELS,
        delivery: await deliverNotification(
          // Delivery is skipped entirely, but reporting it keeps the shape
          // uniform: every call returns a report.
          DISABLED_NOTIFICATION,
          NO_CHANNELS,
          this.deliveryDependencies()
        ),
      };
    }

    const [row] = await this.database
      .insert(NotificationTable)
      .values(values)
      .returning();

    if (!row) {
      throw new NotificationError(
        "Failed to create the notification",
        "NOTIFICATION_CREATE_FAILED"
      );
    }

    const notification = toNotificationDto(row);

    return {
      notification,
      channels,
      delivery: await deliverNotification(
        notification,
        channels,
        this.deliveryDependencies()
      ),
    };
  }

  /** Bind the configured dispatchers to the orchestrator's shape. */
  private deliveryDependencies() {
    return {
      // `publishCreated` swallows broadcast errors and reports `false`, so the
      // boolean has to become a rejection here — otherwise a failed broadcast
      // would be reported as delivered.
      inApp: async (notification: NotificationDto) => {
        const delivered = await this.publishCreated(notification);

        if (!delivered) {
          throw new Error(
            "Notification broadcast did not reach the durable object"
          );
        }

        return true;
      },
      push: this.push,
      email: this.email,
    };
  }

  /**
   * Broadcast an already-persisted notification to the recipient's live sockets.
   *
   * Public so other write paths can deliver in-app without inserting the row a
   * second time. Returns whether the broadcast reached the durable object; it
   * never throws, because the row is already committed.
   */
  async publishCreated(notification: NotificationDto): Promise<boolean> {
    return await this.publish(notification.recipientId, {
      type: "notification.created",
      notification,
      unreadCount: await this.getUnreadCount(notification.recipientId),
    });
  }

  /**
   * Read the recipient's per-category channel settings.
   *
   * `inApp` and `push` default to on when no row exists. `email` deliberately
   * defaults to *off*: the column defaults to true, and treating a missing row
   * as opt-in would start mailing every existing user the moment this channel
   * ships. Email requires an explicit `email_enabled = true` row.
   */
  private async resolveChannels(
    values: CreateNotificationInput
  ): Promise<NotificationChannels> {
    const [settings] = await this.database
      .select({
        inAppEnabled: NotificationSettingsTable.inAppEnabled,
        pushEnabled: NotificationSettingsTable.pushEnabled,
        emailEnabled: NotificationSettingsTable.emailEnabled,
      })
      .from(NotificationSettingsTable)
      .where(
        and(
          eq(NotificationSettingsTable.userId, values.recipientId),
          eq(NotificationSettingsTable.category, values.category)
        )
      )
      .limit(1);

    return {
      inApp: settings?.inAppEnabled ?? true,
      push: settings?.pushEnabled ?? true,
      email: settings?.emailEnabled ?? false,
    };
  }

  async getUnreadCount(recipientId: string): Promise<number> {
    const [row] = await this.database
      .select({ count: count() })
      .from(NotificationTable)
      .where(
        and(
          eq(NotificationTable.recipientId, recipientId),
          eq(NotificationTable.isRead, false),
          eq(NotificationTable.isArchived, false)
        )
      );

    return row?.count ?? 0;
  }

  async markRead(
    recipientId: string,
    notificationIds: string[]
  ): Promise<{ updated: number }> {
    if (notificationIds.length === 0) {
      return { updated: 0 };
    }

    const readAt = new Date();

    const rows = await this.database
      .update(NotificationTable)
      .set({ isRead: true, readAt })
      .where(
        and(
          eq(NotificationTable.recipientId, recipientId),
          eq(NotificationTable.isRead, false),
          inArray(NotificationTable.id, notificationIds)
        )
      )
      .returning({ id: NotificationTable.id });

    if (rows.length > 0) {
      await this.publish(recipientId, {
        type: "notification.read",
        notificationIds: rows.map((row) => row.id),
        readAt: readAt.toISOString(),
        unreadCount: await this.getUnreadCount(recipientId),
      });
    }

    return { updated: rows.length };
  }

  async markAllRead(recipientId: string): Promise<{ updated: number }> {
    const readAt = new Date();

    const rows = await this.database
      .update(NotificationTable)
      .set({ isRead: true, readAt })
      .where(
        and(
          eq(NotificationTable.recipientId, recipientId),
          eq(NotificationTable.isRead, false),
          eq(NotificationTable.isArchived, false)
        )
      )
      .returning({ id: NotificationTable.id });

    if (rows.length > 0) {
      await this.publish(recipientId, {
        type: "notification.read_all",
        readAt: readAt.toISOString(),
        unreadCount: 0,
      });
    }

    return { updated: rows.length };
  }

  private async publish(
    recipientId: string,
    event: NotificationEvent
  ): Promise<boolean> {
    try {
      await this.hubFor(recipientId).publish(event);
      return true;
    } catch (error) {
      notificationLog.error(
        { recipientId, err: error },
        "notification.publish_failed"
      );
      return false;
    }
  }
}

/**
 * Build a service bound to the worker's Durable Object namespace, with Web Push
 * and email wired up.
 *
 * Use this from request handlers and background senders alike so every write
 * path delivers on the same channels. Callers that only need in-app delivery
 * can construct {@link NotificationService} directly.
 *
 * The mail service is imported lazily: it pulls in `react-email` and the queue
 * binding, which most notification writes never touch.
 */
export function createNotificationService(env: Env): NotificationService {
  const database = createDrizzleClient(env.DB);

  return new NotificationService(
    database,
    (recipientId) => bindNotificationHub(env, recipientId),
    {
      push: createWebPushDispatcher(database),
      email: createNotificationEmailDispatcher({
        database,
        // `mail` is the app's configured singleton (queue + templates).
        mail,
      }),
    }
  );
}
