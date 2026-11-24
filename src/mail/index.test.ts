import { beforeEach, describe, expect, it, vi } from "vitest";

import * as mail from "./index";

const {
  createMailFactory,
  createMailTransport,
  createDrizzleClient,
  MailQueueProcessor,
  logger,
  handleBatch,
} = vi.hoisted(() => ({
  createMailFactory: vi.fn(),
  createMailTransport: vi.fn(() => ({ send: vi.fn() })),
  createDrizzleClient: vi.fn(() => ({ db: true })),
  MailQueueProcessor: vi.fn(),
  logger: vi.fn(() => ({ info: vi.fn() })),
  handleBatch: vi.fn(),
}));

vi.mock("./mail.factory", () => ({ createMailFactory }));
vi.mock("./transport/mailTransport.factory", () => ({ createMailTransport }));
vi.mock("#/db/clients/drizzle-client", () => ({ createDrizzleClient }));
vi.mock("#/lib/logger", () => ({ logger }));
vi.mock("./consumer/mailQueue.consumer", () => ({
  MailQueueProcessor: class {
    public handleBatch = handleBatch;

    constructor(database: unknown, transport: unknown, log: unknown) {
      MailQueueProcessor(database, transport, log);
    }
  },
}));

const env = {
  DB: { binding: "DB" },
  ENVIRONMENT: "production" as const,
  LOG_LEVEL: "info",
  RESEND_API_KEY: "re_123",
};

describe("mail module surface", () => {
  it("exports the queue binding and the service factory", () => {
    expect(Object.keys(mail).sort()).toEqual([
      "bindMailQueue",
      "createMailFactory",
    ]);
  });
});

describe("bindMailQueue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("binds the transport, database and logger from the worker env", () => {
    mail.bindMailQueue(env as never);

    expect(createMailTransport).toHaveBeenCalledWith(env);
    expect(createDrizzleClient).toHaveBeenCalledWith(env.DB);
    expect(logger).toHaveBeenCalledWith({
      isDev: false,
      serviceName: "mail-queue",
      logLevel: "info",
    });
    expect(MailQueueProcessor).toHaveBeenCalledWith(
      { db: true },
      { send: expect.any(Function) },
      { info: expect.any(Function) }
    );
  });

  it("flags development environments for the logger", () => {
    mail.bindMailQueue({ ...env, ENVIRONMENT: "development" } as never);

    expect(logger).toHaveBeenCalledWith(
      expect.objectContaining({ isDev: true })
    );
  });

  it("hands the batch to the queue processor", async () => {
    const batch = { queue: "mail-queue", messages: [] };

    await mail.bindMailQueue(env as never).handleBatch(batch as never);

    expect(handleBatch).toHaveBeenCalledWith(batch);
  });
});

describe("createMailFactory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("builds the mail service from the app config", () => {
    const config = {
      database: { db: true },
      queue: { send: vi.fn() },
      mailConfig: {
        appName: "App",
        supportMail: "support@example.com",
        systemMail: "system@example.com",
      },
    };
    const service = { sendMail: vi.fn() };
    createMailFactory.mockReturnValueOnce(service);

    expect(mail.createMailFactory(config as never)).toBe(service);
    expect(createMailFactory).toHaveBeenCalledWith(config);
  });
});
