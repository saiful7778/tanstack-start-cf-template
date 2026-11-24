import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const EnvSchema = z.enum([
  "development",
  "production",
  "staging",
  "test",
] as const);

export const env = createEnv({
  skipValidation: process.env.SKIP_ENV_VALIDATION === "true",
  server: {
    ENVIRONMENT: EnvSchema.default("development"),
  },
  clientPrefix: "VITE_",
  client: {
    VITE_ENVIRONMENT: EnvSchema.default("development"),
    VITE_SITE_URL: z.url(),
  },
  runtimeEnv: typeof window === "undefined" ? process.env : import.meta.env,
  emptyStringAsUndefined: true,
});
