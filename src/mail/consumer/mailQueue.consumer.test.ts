import { createMockDrizzleClient } from "#/db/clients/drizzle-client.mock";
import { getLoggerMock } from "#/lib/logger.mock";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MailQueueProcessor } from "./mailQueue.consumer";

const {
  getEmailById,
  buildOutboundEmailOptions,
  updateEmailById,
  advanceEmailStatus,
} = vi.hoisted(() => ({
  getEmailById: vi.fn(),
  buildOutboundEmailOptions: vi.fn(),
  updateEmailById: vi.fn(),
  advanceEmailStatus: vi.fn(),
}));

vi.mock("../services/email.service", () => ({
  EmailService: class {
    public getEmailById = getEmailById;
    public buildOutboundEmailOptions = buildOutboundEmailOptions;
    public updateEmailById = updateEmailById;
    public advanceEmailStatus = advanceEmailStatus;
  },
}));

const emailId = "11111111-1111-4111-8111-111111111111";

function envelope() {
  return {
    version: 1 as const,
    emailId,
    queuedAt: 1_700_000_000_000,
    isSystemMail: true,
  };
}

function processorWith(
  send = vi.fn<(options: unknown) => Promise<string>>(async () => "resend-1")
) {
  const database = createMockDrizzleClient();
  const transport = { send };
  const logger = getLoggerMock();

  return {
    processor: new MailQueueProcessor(database, transport, logger),
    send,
  };
}

describe("MailQueueProcessor.processMessage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateEmailById.mockResolvedValue(undefined);
    advanceEmailStatus.mockResolvedValue(true);
    buildOutboundEmailOptions.mockResolvedValue({
      from: "a@x.com",
      to: ["b@x.com"],
      subject: "s",
      text: "t",
    });
  });

  it("marks an invalid payload as invalid without sending", async () => {
    const { processor, send } = processorWith();

    const result = await processor.processMessage({ nope: true });

    expect(result).toEqual({ status: "invalid" });
    expect(send).not.toHaveBeenCalled();
  });

  it("rejects an unsupported envelope version", async () => {
    const { processor, send } = processorWith();

    const result = await processor.processMessage({
      ...envelope(),
      version: 2,
    });

    expect(result).toEqual({ status: "invalid" });
    expect(send).not.toHaveBeenCalled();
  });

  it("acks an unknown email as invalid", async () => {
    getEmailById.mockResolvedValueOnce(undefined);
    const { processor, send } = processorWith();

    const result = await processor.processMessage(envelope());

    expect(result).toEqual({ status: "invalid", emailId });
    expect(send).not.toHaveBeenCalled();
  });

  it("skips an email that was already sent", async () => {
    getEmailById.mockResolvedValueOnce({ id: emailId, status: "sent" });
    const { processor, send } = processorWith();

    const result = await processor.processMessage(envelope());

    expect(result).toEqual({ status: "skipped", emailId });
    expect(send).not.toHaveBeenCalled();
  });

  it("sends and records the resend id on success", async () => {
    getEmailById.mockResolvedValueOnce({ id: emailId, status: "queued" });
    const { processor, send } = processorWith();

    const result = await processor.processMessage(envelope());

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ subject: "s" })
    );
    expect(advanceEmailStatus).toHaveBeenCalledWith(emailId, "sent", {
      resendId: "resend-1",
    });
    expect(result).toEqual({ status: "sent", emailId, resendId: "resend-1" });
  });

  it("marks failed and rethrows on send error", async () => {
    getEmailById.mockResolvedValueOnce({ id: emailId, status: "queued" });
    const { processor } = processorWith(
      vi.fn<(options: unknown) => Promise<string>>(async () => {
        throw new Error("resend down");
      })
    );

    await expect(processor.processMessage(envelope())).rejects.toThrow(
      "resend down"
    );

    expect(updateEmailById).toHaveBeenCalledWith(emailId, { status: "failed" });
  });

  it("does not resend when the mail was sent but the status write fails", async () => {
    getEmailById.mockResolvedValueOnce({ id: emailId, status: "queued" });
    advanceEmailStatus.mockRejectedValueOnce(new Error("db write failed"));
    const { processor, send } = processorWith();

    const result = await processor.processMessage(envelope());

    expect(send).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ status: "sent", emailId, resendId: "resend-1" });
  });

  it("does not resend a mail a webhook already moved past `sent`", async () => {
    // The worker died between the status write and `ack()`, so Cloudflare
    // redelivers; by then the delivery webhook has stored `delivered`/`bounced`.
    const { processor, send } = processorWith();

    for (const status of ["delivered", "bounced", "complained", "failed"]) {
      vi.clearAllMocks();
      getEmailById.mockResolvedValueOnce({ id: emailId, status });

      const result = await processor.processMessage(envelope());

      expect(result).toEqual({ status: "skipped", emailId });
      expect(send).not.toHaveBeenCalled();
    }
  });

  it("still sends a queued or never-sent mail", async () => {
    const { processor, send } = processorWith();

    for (const status of ["draft", "queued"]) {
      vi.clearAllMocks();
      getEmailById.mockResolvedValueOnce({ id: emailId, status });

      const result = await processor.processMessage(envelope());

      expect(result).toEqual({ status: "sent", emailId, resendId: "resend-1" });
      expect(send).toHaveBeenCalledTimes(1);
    }
  });

  it("does not downgrade a delivered mail when a retry throws", async () => {
    getEmailById.mockResolvedValueOnce({ id: emailId, status: "queued" });
    const { processor } = processorWith(
      vi.fn<(options: unknown) => Promise<string>>(async () => {
        throw new Error("resend down");
      })
    );

    await expect(processor.processMessage(envelope())).rejects.toThrow(
      "resend down"
    );

    // The row was `queued` when this attempt started, so it is safe to fail it.
    expect(updateEmailById).toHaveBeenCalledWith(emailId, { status: "failed" });
  });

  it("leaves an already-delivered row untouched when a send attempt throws", async () => {
    // A concurrent webhook advanced the row after it was read as `queued`, or
    // the mail had already gone out before this attempt failed.
    getEmailById.mockResolvedValueOnce({ id: emailId, status: "delivered" });
    const { processor, send } = processorWith(
      vi.fn<(options: unknown) => Promise<string>>(async () => {
        throw new Error("resend down");
      })
    );

    // `delivered` is skipped before sending, so nothing is attempted at all.
    const result = await processor.processMessage(envelope());

    expect(result).toEqual({ status: "skipped", emailId });
    expect(send).not.toHaveBeenCalled();
    expect(updateEmailById).not.toHaveBeenCalled();
  });
});

describe("MailQueueProcessor.handleBatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateEmailById.mockResolvedValue(undefined);
    advanceEmailStatus.mockResolvedValue(true);
    buildOutboundEmailOptions.mockResolvedValue({
      from: "a@x.com",
      to: ["b@x.com"],
      subject: "s",
      text: "t",
    });
  });

  it("acks invalid messages and retries failures", async () => {
    getEmailById.mockResolvedValue({ id: emailId, status: "queued" });
    const { processor } = processorWith(
      vi.fn<(options: unknown) => Promise<string>>(async () => {
        throw new Error("boom");
      })
    );

    const ack = vi.fn();
    const retry = vi.fn();
    const ackInvalid = vi.fn();
    const batch = {
      queue: "mail-queue",
      messages: [
        { id: "m1", body: { bad: true }, ack: ackInvalid, retry: vi.fn() },
        { id: "m2", body: envelope(), ack, retry },
      ],
    };

    await processor.handleBatch(batch);

    expect(ackInvalid).toHaveBeenCalledTimes(1);
    expect(retry).toHaveBeenCalledTimes(1);
    expect(ack).not.toHaveBeenCalled();
  });

  it("acks a successfully sent message", async () => {
    getEmailById.mockResolvedValue({ id: emailId, status: "queued" });
    const { processor } = processorWith();

    const ack = vi.fn();
    const retry = vi.fn();
    const batch = {
      queue: "mail-queue",
      messages: [{ id: "m1", body: envelope(), ack, retry }],
    };

    await processor.handleBatch(batch);

    expect(ack).toHaveBeenCalledTimes(1);
    expect(retry).not.toHaveBeenCalled();
  });

  it("acks and skips an already-sent message", async () => {
    getEmailById.mockResolvedValue({ id: emailId, status: "sent" });
    const { processor, send } = processorWith();

    const ack = vi.fn();
    const retry = vi.fn();
    const batch = {
      queue: "mail-queue",
      messages: [{ id: "m1", body: envelope(), ack, retry }],
    };

    await processor.handleBatch(batch);

    expect(ack).toHaveBeenCalledTimes(1);
    expect(retry).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });
});
