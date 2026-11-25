import { NotificationCategoryEnumSchema } from "#/db/schemas/enums/zod-db-enums";
import z from "zod";

export const notificationUpdateSchema = z.object({
  category: NotificationCategoryEnumSchema,
  emailEnabled: z.boolean(),
  pushEnabled: z.boolean(),
  inAppEnabled: z.boolean(),
});
export type NotificationUpdateType = z.infer<typeof notificationUpdateSchema>;
