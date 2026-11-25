import { describe, expect, it } from "vitest";

import { logger } from "./logger";

/** Collect what pino writes by replacing the destination stream. */
function captureLogs(config: Parameters<typeof logger>[0]) {
  const lines: string[] = [];
  const stream = {
    write: (line: string) => {
      lines.push(line);
    },
  };

  const instance = logger(config, stream);

  return { instance, lines };
}

describe("logger", () => {
  it("writes structured JSON with the service name", () => {
    const { instance, lines } = captureLogs({
      logLevel: "info",
      serviceName: "notification",
      isDev: false,
    });

    instance.info({ recipientId: "user-1" }, "notification.created");

    expect(lines).toHaveLength(1);

    const entry = JSON.parse(lines[0]!);

    expect(entry).toMatchObject({
      level: 30,
      service: "notification",
      recipientId: "user-1",
      msg: "notification.created",
    });
    expect(typeof entry.time).toBe("string");
  });

  it("honours the level, dropping entries below it", () => {
    const { instance, lines } = captureLogs({
      logLevel: "warn",
      serviceName: "notification",
      isDev: false,
    });

    instance.debug("too quiet");
    instance.info("also too quiet");
    instance.warn("kept");

    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!).msg).toBe("kept");
  });

  it("serializes errors under `err`", () => {
    const { instance, lines } = captureLogs({
      logLevel: "error",
      serviceName: "notification",
      isDev: false,
    });

    instance.error({ err: new Error("boom") }, "notification.failed");

    const entry = JSON.parse(lines[0]!);

    expect(entry.err).toMatchObject({
      type: "Error",
      message: "boom",
    });
    expect(entry.err.stack).toContain("boom");
  });

  it("redacts secrets from the serialized payload", () => {
    const { instance, lines } = captureLogs({
      logLevel: "info",
      serviceName: "notification",
      isDev: false,
    });

    instance.info(
      { req: { headers: { authorization: "Bearer secret-token" } } },
      "notification.request"
    );

    const entry = JSON.parse(lines[0]!);

    expect(entry.req.headers.authorization).toBe("[REDACTED]");
    expect(lines[0]).not.toContain("secret-token");
  });
});
