import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SendMailOption } from "./mailTransport.types";
import { ResendMailTransport } from "./resend.transport";

const { send } = vi.hoisted(() => ({ send: vi.fn() }));

vi.mock("resend", () => ({
  Resend: class {
    public emails = { send };
  },
}));

function options(): SendMailOption {
  return {
    from: "Sender <sender@example.com>",
    to: ["one@example.com"],
    cc: "cc@example.com",
    bcc: ["bcc@example.com"],
    replyTo: "reply@example.com",
    subject: "Subject",
    text: "plain text",
    html: "<p>html</p>",
  };
}

describe("ResendMailTransport.send", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    send.mockResolvedValue({ data: { id: "resend-1" }, error: null });
  });

  it("forwards provider fields and returns the provider id", async () => {
    const id = await new ResendMailTransport("re_123").send(options());

    expect(send).toHaveBeenCalledWith({
      from: "Sender <sender@example.com>",
      to: ["one@example.com"],
      cc: "cc@example.com",
      bcc: ["bcc@example.com"],
      replyTo: "reply@example.com",
      subject: "Subject",
      text: "plain text",
      html: "<p>html</p>",
    });
    expect(id).toBe("resend-1");
  });

  it("keeps internal fields out of the provider request", async () => {
    await new ResendMailTransport("re_123").send({
      ...options(),
      threadId: "33333333-3333-4333-8333-333333333333",
    });

    expect(send).toHaveBeenCalledWith(
      expect.not.objectContaining({ threadId: expect.anything() })
    );
  });

  it("turns threading fields into standard headers", async () => {
    await new ResendMailTransport("re_123").send({
      ...options(),
      inReplyTo: "<parent@example.com>",
      references: ["<root@example.com>", "<parent@example.com>"],
    });

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: {
          "In-Reply-To": "<parent@example.com>",
          References: "<root@example.com> <parent@example.com>",
        },
      })
    );
  });

  it("merges threading headers with caller-provided headers", async () => {
    await new ResendMailTransport("re_123").send({
      ...options(),
      headers: { "X-Custom": "value" },
      inReplyTo: "<parent@example.com>",
    });

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: { "X-Custom": "value", "In-Reply-To": "<parent@example.com>" },
      })
    );
  });

  it("forwards Resend-only options", async () => {
    await new ResendMailTransport("re_123").send({
      ...options(),
      tags: [{ name: "kind", value: "test" }],
      topicId: "topic-1",
      scheduledAt: "2026-11-24T09:00:00.000Z",
    });

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        tags: [{ name: "kind", value: "test" }],
        topicId: "topic-1",
        scheduledAt: "2026-11-24T09:00:00.000Z",
      })
    );
  });

  it("passes hosted attachment paths through", async () => {
    await new ResendMailTransport("re_123").send({
      ...options(),
      attachments: [
        { filename: "report.pdf", path: "https://files.example.com/r.pdf" },
      ],
    });

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        attachments: [
          { filename: "report.pdf", path: "https://files.example.com/r.pdf" },
        ],
      })
    );
  });

  it("rejects an email without html or text", async () => {
    const bad = { ...options(), text: undefined, html: undefined };

    await expect(
      new ResendMailTransport("re_123").send(bad as SendMailOption)
    ).rejects.toMatchObject({ code: "MAIL_INVALID_PAYLOAD" });
    expect(send).not.toHaveBeenCalled();
  });
});
