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
    RESEND_API_KEY: z.string().optional(),
    RESEND_BASE_URL: z.url().optional(),
    RESEND_INBOUND_WEBHOOK_SECRET: z.string().optional(),
    RESEND_OUTBOUND_WEBHOOK_SECRET: z.string().optional(),
    RESEND_EVENT_WEBHOOK_SECRET: z.string().optional(),
    BETTER_AUTH_SECRET: z.string(),
    GOOGLE_CLIENT_SECRET: z.string(),
    // Web Push is an optional capability: a deployment without VAPID keys
    // still serves the app, it just cannot deliver push messages.
    WEB_PUSH_PRIVATE_KEY: z.string().optional(),
  },
  clientPrefix: "VITE_",
  client: {
    VITE_ENVIRONMENT: EnvSchema.default("development"),
    VITE_SITE_URL: z.url(),
    VITE_SYSTEM_MAIL: z.email(),
    VITE_SUPPORT_MAIL: z.email(),
    VITE_GOOGLE_CLIENT_ID: z.string(),
    VITE_WEB_PUSH_PUBLIC_KEY: z.string().optional(),
  },
  runtimeEnv: typeof window === "undefined" ? process.env : import.meta.env,
  emptyStringAsUndefined: true,
});
