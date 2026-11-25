import pino from "pino";
import PinoPretty from "pino-pretty";

export type LogLevel = pino.Level;

/**
 * A level pino accepts, including `silent`.
 *
 * `pino.Level` omits it even though pino honours it — and silencing is exactly
 * what tests want.
 */
export type ConfigurableLogLevel = LogLevel | "silent";

export interface LoggerConfig {
  logLevel: ConfigurableLogLevel;
  serviceName: string;
  isDev: boolean;
}

export type LoggerType = pino.Logger<never, boolean>;

/**
 * Where log lines go.
 *
 * Defaults to stdout, which is what a Worker should use. Injectable so tests
 * can capture and assert on the emitted entries.
 */
export type LoggerDestination = pino.DestinationStream;

export function logger(config: LoggerConfig, destination?: LoggerDestination) {
  const options: pino.LoggerOptions = {
    level: config.logLevel,
    base: { service: config.serviceName },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: {
      paths: [
        "req.headers.authorization",
        "req.headers.cookie",
        "req.body.password",
        "req.body.token",
        `res.headers["set-cookie"]`,
        "user.token",
      ],
      censor: "[REDACTED]",
    },
    serializers: {
      ...pino.stdSerializers,
      err: pino.stdSerializers.err,
    },
  };

  if (destination) return pino(options, destination);

  return pino(
    options,
    config.isDev
      ? PinoPretty({
          singleLine: true,
          colorize: true,
          translateTime: "SYS:standard",
          ignore: "pid,hostname",
        })
      : undefined
  );
}
