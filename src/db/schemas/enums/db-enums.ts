import { text } from "drizzle-orm/sqlite-core";

import {
  EMAIL_DIRECTION,
  EMAIL_EVENT_TYPE,
  EMAIL_RECIPIENT_TYPE,
  EMAIL_STATUS,
  ROLES,
  USER_EVENT_TYPE,
} from "./enum-values";

export const RoleEnum = (name: string) => text(name, { enum: ROLES });

export const UserEventTypeEnum = (name: string) =>
  text(name, { enum: USER_EVENT_TYPE });

export const EmailDirectionEnum = (name: string) =>
  text(name, { enum: EMAIL_DIRECTION });

export const EmailStatusEnum = (name: string) =>
  text(name, { enum: EMAIL_STATUS });

export const EmailEventTypeEnum = (name: string) =>
  text(name, { enum: EMAIL_EVENT_TYPE });

export const EmailRecipientTypeEnum = (name: string) =>
  text(name, { enum: EMAIL_RECIPIENT_TYPE });
