import { MailError } from "#/mail/mail.error";
import { describe, expect, it, vi } from "vitest";

const { envMock } = vi.hoisted(() => {
  const env: Record<string, string | undefined> = {
    RESEND_EVENT_WEBHOOK_SECRET: "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw",
  };

  return { envMock: env };
});

vi.mock("#/lib/env", () => ({ env: envMock }));
vi.mock("#/lib/db.server", () => ({ db: { source: "test-db" } }));

const { toWebhookResponse, verifyRequest, createResendWebhookHandler } =
  await import("./-webhook.utils");

describe("toWebhookResponse", () => {
  it("acknowledges a permanent 4xx failure as 200 so Resend stops retrying", async () => {
    const response = toWebhookResponse(
      new MailError("Bad request", "MAIL_WEBHOOK_UNAUTHORIZED", 401)
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: false,
      message: "Bad request",
      data: { code: "MAIL_WEBHOOK_UNAUTHORIZED", permanent: true },
    });
  });

  it("keeps a retryable 5xx as a failure", async () => {
    const response = toWebhookResponse(
      new MailError("db down", "MAIL_PERSISTENCE_FAILED", 503)
    );

    expect(response.status).toBe(503);
    expect((await response.json<{ success: boolean }>()).success).toBe(false);
  });

  it("maps an unknown error to 500", async () => {
    const response = toWebhookResponse(new Error("boom"));

    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({
      success: false,
      message: "boom",
    });
  });
});

describe("verifyRequest", () => {
  it("throws when the endpoint secret is not configured", () => {
    expect(() =>
      verifyRequest(
        new Request("https://x.test"),
        "{}",
        "RESEND_INBOUND_WEBHOOK_SECRET"
      )
    ).toThrow(/Secret not found/);
  });
});

describe("createResendWebhookHandler", () => {
  const handler = createResendWebhookHandler(
    "RESEND_EVENT_WEBHOOK_SECRET",
    async ({ event, database }) => ({
      message: "ok",
      data: { type: event.type, database },
    })
  );

  it("rejects an unsigned request without calling the applier", async () => {
    const apply = vi.fn();
    const guarded = createResendWebhookHandler(
      "RESEND_EVENT_WEBHOOK_SECRET",
      apply
    );

    const response = await guarded({
      request: new Request("https://x.test/api/mail/resend/event", {
        method: "POST",
        body: "{}",
      }),
    });

    // Permanent auth failure: acknowledged, not retried.
    expect(response.status).toBe(200);
    expect((await response.json<{ success: boolean }>()).success).toBe(false);
    expect(apply).not.toHaveBeenCalled();
  });

  it("wires the verified event and database into the applier", async () => {
    const { Webhook } = await import("standardwebhooks");
    const payload = JSON.stringify({
      type: "email.sent",
      created_at: "2026-11-25T00:00:00.000Z",
      data: { email_id: "e1", message_id: "<m@x>" },
    });
    const id = "msg_1";
    const timestamp = new Date();
    const signature = new Webhook(
      envMock.RESEND_EVENT_WEBHOOK_SECRET as string
    ).sign(id, timestamp, payload);

    const request = new Request("https://x.test/api/mail/resend/event", {
      method: "POST",
      body: payload,
      headers: {
        "svix-id": id,
        "svix-timestamp": String(Math.floor(timestamp.getTime() / 1000)),
        "svix-signature": signature,
      },
    });

    const response = await handler({ request });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      success: true,
      data: { type: "email.sent", database: { source: "test-db" } },
    });
  });
});
