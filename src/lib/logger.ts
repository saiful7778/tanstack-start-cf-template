import pino from "pino";
import PinoPretty from "pino-pretty";

export type LogLevel = pino.Level;

export interface LoggerConfig {
  logLevel: LogLevel;
  serviceName: string;
  isDev: boolean;
}

export type LoggerType = pino.Logger<never, boolean>;

export function logger(config: LoggerConfig) {
  return pino(
    {
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
    },
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
