import { API_MESSAGES } from "#/constants/apiMessage";
import {
  NotificationSettingsTable,
  NotificationTable,
  PushSubscriptionTable,
} from "#/db/schemas";
import { NotificationCategoryEnumSchema } from "#/db/schemas/enums/zod-db-enums";
import { buildPaginateOptions, buildPaginationMeta } from "#/db/utils";
import { authMiddleware } from "#/oRPC/middleware/auth.middleware";
import { errorMiddleware } from "#/oRPC/middleware/error.middleware";
import type { ORPCContext } from "#/types/orpc.types";
import { apiResponse } from "#/utils/apiResponse";
import { implement } from "@orpc/server";
import { and, desc, eq, type SQL } from "drizzle-orm";

import { notificationHubFor } from "../server/notification.hub.server";
import { NotificationService } from "../server/notification.service";
import { notificationContract } from "./notification.contract";

export const notificationImpl = implement(notificationContract)
  .$context<ORPCContext>()
  .use(authMiddleware)
  .use(errorMiddleware);

export const listNotificationProcedure = notificationImpl.list.handler(
  async ({ context, input }) => {
    const { page, limit, offset, where } = buildPaginateOptions(
      {
        title: NotificationTable.title,
        level: NotificationTable.level,
        category: NotificationTable.category,
        isRead: NotificationTable.isRead,
        createdAt: NotificationTable.createdAt,
      },
      input
    );

    // `buildFilterWhere` drops falsy values, so `isRead: false` and
    // `isArchived: false` are applied explicitly instead of through the util.
    const conditions: SQL[] = [
      eq(NotificationTable.recipientId, context.user.id),
    ];

    if (where) conditions.push(where);
    if (typeof input.filter?.isRead === "boolean") {
      conditions.push(eq(NotificationTable.isRead, input.filter.isRead));
    }
    if (typeof input.filter?.isArchived === "boolean") {
      conditions.push(
        eq(NotificationTable.isArchived, input.filter.isArchived)
      );
    }

    const notificationWhere = and(...conditions);

    const [totalCount, notifications] = await Promise.all([
      context.db.$count(NotificationTable, notificationWhere),
      context.db
        .select({
          id: NotificationTable.id,
          category: NotificationTable.category,
          level: NotificationTable.level,
          title: NotificationTable.title,
          message: NotificationTable.message,
          data: NotificationTable.data,
          isRead: NotificationTable.isRead,
          readAt: NotificationTable.readAt,
          createdAt: NotificationTable.createdAt,
          updatedAt: NotificationTable.updatedAt,
        })
        .from(NotificationTable)
        .where(notificationWhere)
        .orderBy(desc(NotificationTable.createdAt))
        .offset(offset)
        .limit(limit),
    ]);

    return apiResponse(API_MESSAGES.NOTIFICATION.GET_NOTIFICATIONS, {
      meta: buildPaginationMeta(totalCount, notifications.length, page, limit),
      data: notifications,
    });
  }
);

export const unreadCountProcedure = notificationImpl.unreadCount.handler(
  async ({ context }) => {
    const service = new NotificationService(context.db, notificationHubFor);

    return apiResponse(API_MESSAGES.NOTIFICATION.GET_UNREAD_COUNT, {
      count: await service.getUnreadCount(context.user.id),
    });
  }
);

export const settingsDetailsProcedure = notificationImpl.settings.handler(
  async ({ context }) => {
    const userSettings = await context.db
      .select()
      .from(NotificationSettingsTable)
      .where(eq(NotificationSettingsTable.userId, context.user.id));

    const settings = NotificationCategoryEnumSchema.options.map((category) => {
      const existing = userSettings.find((s) => s.category === category);
      return {
        category,
        emailEnabled: existing?.emailEnabled ?? true,
        pushEnabled: existing?.pushEnabled ?? true,
        inAppEnabled: existing?.inAppEnabled ?? true,
      };
    });

    return apiResponse(API_MESSAGES.NOTIFICATION.GET_SETTINGS, settings);
  }
);

export const updateSettingsProcedure = notificationImpl.updateSettings.handler(
  async ({ context, input }) => {
    await context.db
      .insert(NotificationSettingsTable)
      .values({
        userId: context.user.id,
        category: input.category,
        emailEnabled: input.emailEnabled,
        pushEnabled: input.pushEnabled,
        inAppEnabled: input.inAppEnabled,
      })
      .onConflictDoUpdate({
        target: [
          NotificationSettingsTable.userId,
          NotificationSettingsTable.category,
        ],
        set: {
          emailEnabled: input.emailEnabled,
          pushEnabled: input.pushEnabled,
          inAppEnabled: input.inAppEnabled,
        },
      });

    return apiResponse(API_MESSAGES.NOTIFICATION.UPDATE_SETTINGS, null);
  }
);

export const markAsReadProcedure = notificationImpl.markAsRead.handler(
  async ({ context, input }) => {
    const service = new NotificationService(context.db, notificationHubFor);

    const result = await service.markRead(context.user.id, input.ids);

    return apiResponse(API_MESSAGES.NOTIFICATION.MARK_AS_READ, result);
  }
);

export const markAllAsReadProcedure = notificationImpl.markAllAsRead.handler(
  async ({ context }) => {
    const service = new NotificationService(context.db, notificationHubFor);

    const result = await service.markAllRead(context.user.id);

    return apiResponse(API_MESSAGES.NOTIFICATION.MARK_ALL_AS_READ, result);
  }
);

export const subscribePushNotificationProcedure =
  notificationImpl.subscribe.handler(async ({ context, input }) => {
    await context.db
      .insert(PushSubscriptionTable)
      .values({
        userId: context.user.id,
        endpoint: input.endpoint,
        auth: input.auth,
        p256dh: input.p256dh,
        expirationTime: input.expirationTime,
      })
      .onConflictDoUpdate({
        target: [PushSubscriptionTable.endpoint],
        set: {
          userId: context.user.id,
          auth: input.auth,
          p256dh: input.p256dh,
          expirationTime: input.expirationTime,
        },
      });

    return apiResponse(API_MESSAGES.NOTIFICATION.SUBSCRIBE_PUSH, null);
  });

export const unsubscribePushNotificationProcedure =
  notificationImpl.unsubscribe.handler(async ({ context, input }) => {
    await context.db
      .delete(PushSubscriptionTable)
      .where(
        and(
          eq(PushSubscriptionTable.userId, context.user.id),
          eq(PushSubscriptionTable.endpoint, input.endpoint)
        )
      );

    return apiResponse(API_MESSAGES.NOTIFICATION.UNSUBSCRIBE_PUSH, null);
  });
