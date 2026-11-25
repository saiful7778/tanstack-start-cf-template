import z from "zod";

import {
  ACTION_TYPE,
  EMAIL_DIRECTION,
  EMAIL_EVENT_TYPE,
  EMAIL_RECIPIENT_TYPE,
  EMAIL_STATUS,
  NOTIFICATION_CATEGORY,
  NOTIFICATION_LEVEL,
  PERMISSION_LEVEL,
  RESOURCE_TYPE,
  ROLES,
  USER_EVENT_TYPE,
} from "./enum-values";

export const RoleEnumSchema = z.enum(ROLES);
export type RoleEnumType = z.infer<typeof RoleEnumSchema>;

export const PermissionLevelEnumSchema = z.enum(PERMISSION_LEVEL);
export type PermissionLevelEnumType = z.infer<typeof PermissionLevelEnumSchema>;

export const ResourceTypeEnumSchema = z.enum(RESOURCE_TYPE);
export type ResourceTypeEnumType = z.infer<typeof ResourceTypeEnumSchema>;

export const ActionTypeEnumSchema = z.enum(ACTION_TYPE);
export type ActionTypeEnumType = z.infer<typeof ActionTypeEnumSchema>;

export const UserEventTypeEnumSchema = z.enum(USER_EVENT_TYPE);
export type UserEventTypeEnumType = z.infer<typeof UserEventTypeEnumSchema>;

export const EmailDirectionEnumSchema = z.enum(EMAIL_DIRECTION);
export type EmailDirectionEnumType = z.infer<typeof EmailDirectionEnumSchema>;

export const EmailStatusEnumSchema = z.enum(EMAIL_STATUS);
export type EmailStatusEnumType = z.infer<typeof EmailStatusEnumSchema>;

export const EmailEventTypeEnumSchema = z.enum(EMAIL_EVENT_TYPE);
export type EmailEventTypeEnumType = z.infer<typeof EmailEventTypeEnumSchema>;

export const EmailRecipientTypeEnumSchema = z.enum(EMAIL_RECIPIENT_TYPE);
export type EmailRecipientTypeEnumType = z.infer<
  typeof EmailRecipientTypeEnumSchema
>;

export const NotificationCategoryEnumSchema = z.enum(NOTIFICATION_CATEGORY);
export type NotificationCategoryEnumType = z.infer<
  typeof NotificationCategoryEnumSchema
>;

export const NotificationLevelEnumSchema = z.enum(NOTIFICATION_LEVEL);
export type NotificationLevelEnumType = z.infer<
  typeof NotificationLevelEnumSchema
>;
