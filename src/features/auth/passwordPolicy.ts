import { passwordField } from "#/lib/zod-schemas/baseZodSchema";
import { APIError } from "better-auth";

const passwordSchema = passwordField({
  fieldName: "password",
  restrict: true,
});

export function assertPasswordPolicy(value: unknown) {
  const result = passwordSchema.safeParse(value);

  if (!result.success) {
    throw new APIError("BAD_REQUEST", {
      message: result.error.issues[0]?.message ?? "Invalid password",
    });
  }
}
