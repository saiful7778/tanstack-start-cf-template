import { text } from "drizzle-orm/sqlite-core";

import { ROLES, USER_EVENT_TYPE } from "./enum-values";

export const RoleEnum = (name: string) => text(name, { enum: ROLES });

export const UserEventTypeEnum = (name: string) =>
  text(name, { enum: USER_EVENT_TYPE });
