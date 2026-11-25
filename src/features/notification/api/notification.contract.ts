import {
  selectNotificationSchema,
  selectNotificationSettingsSchema,
} from "#/db/schemas";
import {
  NotificationCategoryEnumSchema,
  NotificationLevelEnumSchema,
} from "#/db/schemas/enums/zod-db-enums";
import { apiOutputSchema } from "#/lib/zod-schemas/apiOutputSchema";
import { paginateInputSchema } from "#/lib/zod-schemas/paginateInputSchema";
import { paginateOutputSchema } from "#/lib/zod-schemas/paginateOutputSchema";
import { baseContract } from "#/oRPC/orpc.contract-base";
import type { InferContractRouterType } from "#/types/orpc.types";
import z from "zod";

import { notificationUpdateSchema } from "../notification.schema";

const tags = ["Notification"] as const;

/** Rows exposed by the list endpoint; `data` may hold links or context. */
const notificationItemSchema = selectNotificationSchema.pick({
  id: true,
  category: true,
  level: true,
  title: true,
  message: true,
  data: true,
  isRead: true,
  readAt: true,
  createdAt: true,
  updatedAt: true,
});

const listNotificationContract = baseContract
  .route({
    method: "GET",
    path: "/notifications/list",
    description: "Get all user notifications",
    tags,
  })
  .input(
    paginateInputSchema<typeof selectNotificationSchema>({
      searchFields: ["title"],
      orderFields: ["createdAt"],
      filter: z.object({
        level: NotificationLevelEnumSchema.optional(),
        category: NotificationCategoryEnumSchema.optional(),
        isRead: z.boolean().optional(),
        isArchived: z.boolean().optional(),
      }),
    })
  )
  .output(apiOutputSchema(paginateOutputSchema(notificationItemSchema)));
export type ListNotificationContractType = InferContractRouterType<
  typeof listNotificationContract
>;

const unreadCountContract = baseContract
  .route({
    method: "GET",
    path: "/notifications/unread-count",
    description: "Get the number of unread notifications",
    tags,
  })
  .output(apiOutputSchema(z.object({ count: z.number().int().nonnegative() })));
export type UnreadCountContractType = InferContractRouterType<
  typeof unreadCountContract
>;

const settingsDetailsContract = baseContract
  .route({
    method: "GET",
    path: "/notifications/settings",
    description: "Get user notification settings",
    tags,
  })
  .output(
    apiOutputSchema(
      z.array(
        selectNotificationSettingsSchema.pick({
          category: true,
          emailEnabled: true,
          pushEnabled: true,
          inAppEnabled: true,
        })
      )
    )
  );
export type SettingsDetailsContractType = InferContractRouterType<
  typeof settingsDetailsContract
>;

const updateSettingsContract = baseContract
  .route({
    path: "/notifications/settings/update",
    description: "Update a specific notification channel setting",
    tags,
  })
  .input(notificationUpdateSchema)
  .output(apiOutputSchema(z.null()));
export type UpdateSettingsContractType = InferContractRouterType<
  typeof updateSettingsContract
>;

const markAsReadContract = baseContract
  .route({
    path: "/notifications/mark-as-read",
    description: "Mark notifications as read",
    tags,
  })
  .input(z.object({ ids: z.array(z.uuid()).min(1) }))
  .output(
    apiOutputSchema(z.object({ updated: z.number().int().nonnegative() }))
  );
export type MarkAsReadContractType = InferContractRouterType<
  typeof markAsReadContract
>;

const markAllAsReadContract = baseContract
  .route({
    path: "/notifications/mark-all-as-read",
    description: "Mark every unread notification as read",
    tags,
  })
  .output(
    apiOutputSchema(z.object({ updated: z.number().int().nonnegative() }))
  );
export type MarkAllAsReadContractType = InferContractRouterType<
  typeof markAllAsReadContract
>;

const subscribePushNotificationContract = baseContract
  .route({
    path: "/notifications/push-subscription/subscribe",
    description: "Subscribe to push notifications",
    tags,
  })
  .input(
    z.object({
      endpoint: z.url(),
      p256dh: z.string(),
      auth: z.string(),
      expirationTime: z.number().nullable().optional(),
    })
  )
  .output(apiOutputSchema(z.null()));
export type SubscribePushNotificationContractType = InferContractRouterType<
  typeof subscribePushNotificationContract
>;

const unsubscribePushNotificationContract = baseContract
  .route({
    path: "/notifications/push-subscription/unsubscribe",
    description: "Unsubscribe one device from push notifications",
    tags,
  })
  // The endpoint identifies a single browser. Deleting by user alone would
  // silently disable push on every other device the user owns.
  .input(z.object({ endpoint: z.url() }))
  .output(apiOutputSchema(z.null()));
export type UnsubscribePushNotificationContractType = InferContractRouterType<
  typeof unsubscribePushNotificationContract
>;

export const notificationContract = {
  list: listNotificationContract,
  unreadCount: unreadCountContract,
  settings: settingsDetailsContract,
  updateSettings: updateSettingsContract,
  markAsRead: markAsReadContract,
  markAllAsRead: markAllAsReadContract,
  subscribe: subscribePushNotificationContract,
  unsubscribe: unsubscribePushNotificationContract,
};
