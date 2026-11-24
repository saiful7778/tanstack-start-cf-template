import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkerMailerOptions } from "worker-mailer";

import { MailError } from "../mail.error";
import type { SendMailOption } from "./mailTransport.types";
import { WorkerMailerTransport } from "./workerMailer.transport";

const { connect, send, close } = vi.hoisted(() => ({
  connect: vi.fn(),
  send: vi.fn(),
  close: vi.fn(),
}));

vi.mock("worker-mailer", () => ({
  WorkerMailer: { connect },
}));

const config: WorkerMailerOptions = {
  host: "smtp.example.com",
  port: 587,
  credentials: { username: "user@example.com", password: "secret" },
};

interface TextEmailOptions {
  from: string;
  to: string[];
  subject: string;
  text: string;
}

function emailOptions(): TextEmailOptions {
  return {
    from: "sender@example.com",
    to: ["one@example.com", "two@example.com"],
    subject: "Subject",
    text: "plain text",
  };
}

describe("WorkerMailerTransport.send", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    connect.mockResolvedValue({ send, close });
    send.mockResolvedValue(undefined);
    close.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("maps email options to SMTP, closes the connection, and returns a generated id", async () => {
    const id = "22222222-2222-4222-8222-222222222222";
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(id);
    const transport = new WorkerMailerTransport(config);

    const result = await transport.send({
      ...emailOptions(),
      html: "<p>html</p>",
      cc: "cc@example.com",
      bcc: ["bcc@example.com"],
      replyTo: "reply@example.com",
      headers: { "X-Custom": "value" },
    });

    expect(connect).toHaveBeenCalledWith(config);
    expect(send).toHaveBeenCalledWith({
      from: "sender@example.com",
      to: ["one@example.com", "two@example.com"],
      subject: "Subject",
      text: "plain text",
      html: "<p>html</p>",
      cc: "cc@example.com",
      bcc: ["bcc@example.com"],
      reply: "reply@example.com",
      headers: { "X-Custom": "value" },
    });
    expect(close).toHaveBeenCalledTimes(1);
    expect(result).toBe(id);
  });

  it("rejects an email without html or text before connecting", async () => {
    const transport = new WorkerMailerTransport(config);
    const options = {
      from: "sender@example.com",
      to: "one@example.com",
      subject: "Subject",
    };

    const result = await transport
      .send(options as SendMailOption)
      .catch((error: unknown) => error);

    expect(result).toBeInstanceOf(MailError);
    expect(result).toMatchObject({
      code: "MAIL_INVALID_PAYLOAD",
      message: "Either 'html' or 'text' must be provided.",
    });
    expect(connect).not.toHaveBeenCalled();
  });

  it("rejects an email without a from address or subject", async () => {
    const transport = new WorkerMailerTransport(config);
    const options = {
      ...emailOptions(),
      from: undefined,
      subject: undefined,
      to: "one@example.com",
    };

    const result = await transport
      .send(options as unknown as SendMailOption)
      .catch((error: unknown) => error);

    expect(result).toBeInstanceOf(MailError);
    expect(result).toMatchObject({ code: "MAIL_INVALID_PAYLOAD" });
    expect(connect).not.toHaveBeenCalled();
  });

  it("joins multiple reply-to addresses into a single SMTP reply header", async () => {
    const transport = new WorkerMailerTransport(config);

    await transport.send({
      ...emailOptions(),
      text: "plain text",
      replyTo: ["first@example.com", "second@example.com"],
    });

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        reply: "first@example.com, second@example.com",
      })
    );
  });

  it("wraps an SMTP send failure in a MailError and closes the connection", async () => {
    send.mockRejectedValueOnce(new Error("smtp unavailable"));
    const transport = new WorkerMailerTransport(config);

    const result = await transport
      .send(emailOptions())
      .catch((error: unknown) => error);

    expect(result).toBeInstanceOf(MailError);
    expect(result).toMatchObject({
      code: "MAIL_TRANSPORT_FAILED",
      message: "smtp unavailable",
    });
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("wraps a connection failure without trying to send", async () => {
    connect.mockRejectedValueOnce(new Error("connection refused"));
    const transport = new WorkerMailerTransport(config);

    const result = await transport
      .send(emailOptions())
      .catch((error: unknown) => error);

    expect(result).toBeInstanceOf(MailError);
    expect(result).toMatchObject({
      code: "MAIL_TRANSPORT_FAILED",
      message: "connection refused",
    });
    expect(send).not.toHaveBeenCalled();
  });

  it("base64-encodes binary attachment content and keeps its content type", async () => {
    const transport = new WorkerMailerTransport(config);

    await transport.send({
      ...emailOptions(),
      attachments: [
        {
          filename: "greeting.txt",
          content: new Uint8Array([72, 105]),
          contentType: "text/plain",
        },
      ],
    });

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        attachments: [
          { filename: "greeting.txt", content: "SGk=", mimeType: "text/plain" },
        ],
      })
    );
  });

  it("passes base64 attachment strings through unchanged", async () => {
    const transport = new WorkerMailerTransport(config);

    await transport.send({
      ...emailOptions(),
      attachments: [
        {
          filename: "note.txt",
          content: "Tm90ZQ==",
          contentType: "text/plain",
        },
      ],
    });

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        attachments: [
          { filename: "note.txt", content: "Tm90ZQ==", mimeType: "text/plain" },
        ],
      })
    );
  });

  it("skips attachments without a filename or content", async () => {
    const transport = new WorkerMailerTransport(config);

    await transport.send({
      ...emailOptions(),
      attachments: [
        { filename: false, content: "Tm90ZQ==" },
        { filename: "empty.txt" },
      ],
    });

    expect(send).toHaveBeenCalledWith(
      expect.not.objectContaining({ attachments: expect.anything() })
    );
  });
});
