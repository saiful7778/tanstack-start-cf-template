import { beforeEach, describe, expect, it, vi } from "vitest";

import { MailError } from "../mail.error";
import { verifyResendWebhook } from "./resendWebhook.verify";

const { ResendCtor } = vi.hoisted(() => ({ ResendCtor: vi.fn() }));

vi.mock("resend", () => ({ Resend: ResendCtor }));

// The client reads its key from the validated env, so drive it directly.
const { envMock } = vi.hoisted(() => {
  const env: { RESEND_API_KEY?: string; RESEND_BASE_URL?: string } = {};

  return { envMock: env };
});

vi.mock("#/lib/env", () => ({ env: envMock }));

describe("getResendClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    envMock.RESEND_API_KEY = undefined;
    envMock.RESEND_BASE_URL = undefined;
  });

  it("throws a MailError instead of crashing when no API key is set", async () => {
    const { getResendClient: fresh } = await import("./resendClient");

    // `resetModules` reloads MailError too, so match the shape, not identity.
    expect(() => fresh()).toThrow(
      /RESEND_API_KEY is required to call the Resend API/
    );
    expect(ResendCtor).not.toHaveBeenCalled();
  });

  it("builds the client once and reuses it", async () => {
    envMock.RESEND_API_KEY = "re_123";
    const { getResendClient: fresh } = await import("./resendClient");

    fresh();
    fresh();

    expect(ResendCtor).toHaveBeenCalledTimes(1);
    expect(ResendCtor).toHaveBeenCalledWith("re_123", undefined);
  });

  it("forwards a custom base url", async () => {
    envMock.RESEND_API_KEY = "re_123";
    envMock.RESEND_BASE_URL = "http://localhost:3099";
    const { getResendClient: fresh } = await import("./resendClient");

    fresh();

    expect(ResendCtor).toHaveBeenCalledWith("re_123", {
      baseUrl: "http://localhost:3099",
    });
  });
});

describe("module import", () => {
  it("does not need an API key to be imported", async () => {
    envMock.RESEND_API_KEY = undefined;
    vi.resetModules();

    await expect(import("./index")).resolves.toBeDefined();
  });
});

describe("verifyResendWebhook", () => {
  // Fixed secret/id/timestamp so the signature can be recomputed by the SDK.
  const secret = "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw";
  const payload = JSON.stringify({
    type: "email.delivered",
    created_at: "2026-11-25T00:00:00.000Z",
    data: {
      email_id: "email-1",
      message_id: "<msg@x>",
      from: "a@x.com",
      to: ["b@x.com"],
      subject: "s",
      created_at: "2026-11-25T00:00:00.000Z",
    },
  });

  let signedHeaders: Headers;

  beforeEach(async () => {
    const { Webhook } = await import("standardwebhooks");
    const timestamp = new Date();
    const id = "msg_1";
    const signature = new Webhook(secret).sign(id, timestamp, payload);

    signedHeaders = new Headers({
      "svix-id": id,
      "svix-timestamp": String(Math.floor(timestamp.getTime() / 1000)),
      "svix-signature": signature,
    });
  });

  it("accepts a correctly signed payload", () => {
    const event = verifyResendWebhook(signedHeaders, payload, secret);

    expect(event.type).toBe("email.delivered");
  });

  it("rejects a tampered payload with a 401, not a crash", () => {
    const forged = payload.replace("email-1", "email-2");

    expect(() => verifyResendWebhook(signedHeaders, forged, secret)).toThrow(
      MailError
    );

    try {
      verifyResendWebhook(signedHeaders, forged, secret);
    } catch (error) {
      expect((error as MailError).statusCode).toBe(401);
      expect((error as MailError).code).toBe("MAIL_WEBHOOK_UNAUTHORIZED");
    }
  });

  it("rejects a stale timestamp", () => {
    const stale = new Headers(signedHeaders);
    stale.set("svix-timestamp", "1614265330");

    expect(() => verifyResendWebhook(stale, payload, secret)).toThrow(
      MailError
    );

    try {
      verifyResendWebhook(stale, payload, secret);
    } catch (error) {
      expect((error as MailError).statusCode).toBe(401);
      expect((error as MailError).metadata).toEqual({
        reason: "Message timestamp too old",
      });
    }
  });

  it.each(["svix-id", "svix-timestamp", "svix-signature"])(
    "rejects a request missing %s",
    (header) => {
      const incomplete = new Headers(signedHeaders);
      incomplete.delete(header);

      expect(() => verifyResendWebhook(incomplete, payload, secret)).toThrow(
        MailError
      );
    }
  );

  it("rejects a request when no secret is configured", () => {
    expect(() =>
      verifyResendWebhook(signedHeaders, payload, undefined)
    ).toThrow(/Secret not found/);
  });
});
