import { RoleEnumSchema } from "#/db/schemas/enums/zod-db-enums";
import { emailField } from "#/lib/zod-schemas/baseZodSchema";
import z from "zod";

export const userUpdateSchema = z.object({
  displayRole: z.string().nullable(),
  role: RoleEnumSchema,
});
export type UserUpdateType = z.infer<typeof userUpdateSchema>;

export const roleUpdateSchema = z.object({
  userId: z.uuid(),
  roleName: RoleEnumSchema,
});
export type RoleUpdateType = z.infer<typeof roleUpdateSchema>;

export const userBannedSchema = z.object({
  userId: z.uuid(),
  banned: z.boolean().optional(),
  banReason: z.string().optional(),
  banExpires: z.date().optional(),
});
export type UserBannedType = z.infer<typeof userBannedSchema>;

export const profileUpdateSchema = z.object({
  name: z.string(),
  email: emailField({ fieldName: "email" }),
});
export type ProfileUpdateType = z.infer<typeof profileUpdateSchema>;
