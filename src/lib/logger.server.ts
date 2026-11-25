import { env as workerEnv } from "cloudflare:workers";

import { logger, type ConfigurableLogLevel, type LoggerType } from "./logger";

/**
 * Levels pino accepts, including the one that silences output.
 *
 * `pino.Level` omits `silent`, but that is exactly what tests want, so the
 * accepted set is declared here rather than casting at the call site.
 */
const LEVELS = [
  "fatal",
  "error",
  "warn",
  "info",
  "debug",
  "trace",
  "silent",
] as const;

/**
 * Resolve a log level from configuration.
 *
 * Accepts `unknown` because the worker env type declares `LOG_LEVEL` as a
 * required string while it is genuinely absent outside a deployed Worker
 * (tests, scripts). Narrowing here keeps call sites free of casts.
 */
function resolveLevel(value: unknown): ConfigurableLogLevel {
  // Tests assert on behaviour, not output: keep the run readable unless a test
  // explicitly opts in by lowering the level.
  if (process.env.VITEST === "true" || process.env.NODE_ENV === "test") {
    return "silent";
  }

  if (
    typeof value === "string" &&
    (LEVELS as readonly string[]).includes(value)
  ) {
    return value as ConfigurableLogLevel;
  }

  return "info";
}

/**
 * `LOG_LEVEL` is declared as a required string in `Env`, but it is absent at
 * runtime outside a configured Worker (tests, scripts), so the value is read
 * through a partial view and validated by `resolveLevel`.
 */
const env = workerEnv as Partial<typeof workerEnv>;

/**
 * The application logger for Worker-side code.
 *
 * Reads the worker environment, so it works in request handlers, Durable
 * Objects and queue consumers alike. It must not be imported from a browser
 * module — pino needs Node APIs, and `console` is the correct sink in a
 * browser anyway.
 *
 * Prefer the module-scoped children below (`authLog`, `notificationLog`) over
 * `log` directly: they add a `module` field so entries can be filtered by
 * feature.
 */
export const log: LoggerType = logger({
  logLevel: resolveLevel(env.LOG_LEVEL ?? process.env.LOG_LEVEL),
  serviceName: "app",
  isDev: env.ENVIRONMENT === "development",
});

/** Structured loggers for server-side modules, grouped by feature. */
export const authLog = log.child({ module: "auth" });
export const notificationLog = log.child({ module: "notification" });
export const mailLog = log.child({ module: "mail" });
export const queueLog = log.child({ module: "queue" });
