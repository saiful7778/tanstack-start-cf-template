import { beforeEach, describe, expect, it, vi } from "vitest";

import server from "./server";

const { bindMailQueue, handleBatch } = vi.hoisted(() => ({
  bindMailQueue: vi.fn(),
  handleBatch: vi.fn(),
}));

vi.mock("./mail", () => ({ bindMailQueue }));

const env = { RESEND_API_KEY: "re_123", DB: {}, LOG_LEVEL: "info" };

describe("mail queue handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bindMailQueue.mockReturnValue({ handleBatch });
  });

  it("binds the worker env and forwards mail-queue batches", async () => {
    const batch = { queue: "mail-queue", messages: [] };

    await server.queue(batch as never, env as never);

    expect(bindMailQueue).toHaveBeenCalledWith(env);
    expect(handleBatch).toHaveBeenCalledWith(batch);
  });

  it("ignores unknown queues", async () => {
    await server.queue({ queue: "other", messages: [] } as never, env as never);

    expect(bindMailQueue).not.toHaveBeenCalled();
  });
});
