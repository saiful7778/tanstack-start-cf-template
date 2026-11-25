import {
  NotificationCategoryEnumSchema,
  NotificationLevelEnumSchema,
} from "#/db/schemas/enums/zod-db-enums";
import { insertNotificationSchema } from "#/db/schemas/table/notification";
import { z } from "zod";

/** A notification as it is serialized over the wire. */
export const notificationSchema = z.object({
  id: z.uuid(),
  recipientId: z.uuid(),
  actorId: z.uuid().nullable(),
  category: NotificationCategoryEnumSchema,
  level: NotificationLevelEnumSchema,
  title: z.string().min(1),
  message: z.string().min(1),
  data: z.record(z.string(), z.unknown()).nullable(),
  isRead: z.boolean(),
  readAt: z.iso.datetime().nullable(),
  isArchived: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type NotificationDto = z.infer<typeof notificationSchema>;

/** The D1 insert payload accepted by {@link NotificationService.create}. */
export const createNotificationInputSchema = insertNotificationSchema;

export type CreateNotificationInput = z.input<
  typeof createNotificationInputSchema
>;

/** Events the durable object pushes to every connected socket. */
export const notificationEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("notification.created"),
    notification: notificationSchema,
    unreadCount: z.number().int().nonnegative(),
  }),
  z.object({
    type: z.literal("notification.read"),
    notificationIds: z.array(z.uuid()).min(1),
    readAt: z.iso.datetime(),
    unreadCount: z.number().int().nonnegative(),
  }),
  z.object({
    type: z.literal("notification.read_all"),
    readAt: z.iso.datetime(),
    unreadCount: z.number().int().nonnegative(),
  }),
  z.object({
    type: z.literal("notification.unread_count"),
    count: z.number().int().nonnegative(),
  }),
]);

export type NotificationEvent = z.infer<typeof notificationEventSchema>;

/** Messages a client may send to the durable object. */
export const notificationClientMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("ping") }),
  z.object({ type: z.literal("unread_count") }),
]);

export type NotificationClientMessage = z.infer<
  typeof notificationClientMessageSchema
>;

/** Messages the durable object may send to a client. */
export type NotificationServerMessage =
  | NotificationEvent
  | { type: "connected"; recipientId: string; unreadCount: number }
  | { type: "pong"; timestamp: number }
  | { type: "error"; message: string };
