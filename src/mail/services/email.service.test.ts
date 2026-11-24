import { readFileSync } from "node:fs";
import path from "node:path";

import { createMockDrizzleClient } from "#/db/clients/drizzle-client.mock";
import { EmailRecipientTable, EmailTable } from "#/db/schemas";
import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { EmailService } from "../services/email.service";

const SCHEMA_SQL = readFileSync(
  path.resolve(process.cwd(), "full-schema.sql"),
  "utf8"
);

const database = createMockDrizzleClient();
const emailService = new EmailService(database);

beforeAll(async () => {
  // The in-memory mock starts empty; apply the shipped schema once.
  await database.$client.exec(SCHEMA_SQL);
});

function inboundPayload(id = "resend-inbound-1") {
  return {
    object: "email" as const,
    id,
    to: ["inbox@x.com"],
    from: "Sender <sender@x.com>",
    created_at: "2026-11-25T00:00:00.000Z",
    subject: "Re: hello",
    bcc: null,
    cc: null,
    reply_to: null,
    received_for: ["inbox@x.com"],
    html: "<p>hi</p>",
    text: "hi",
    headers: { "in-reply-to": "<parent@x.com>" },
    message_id: "<child@x.com>",
    attachments: [],
  };
}

describe("createInboundEmailRecord", () => {
  beforeEach(async () => {
    await database.delete(EmailRecipientTable);
    await database.delete(EmailTable);
  });

  it("stores an inbound email with its recipients", async () => {
    const { emailId, duplicate } =
      await emailService.createInboundEmailRecord(inboundPayload());

    expect(duplicate).toBe(false);

    const [email] = await database
      .select()
      .from(EmailTable)
      .where(eq(EmailTable.id, emailId));

    expect(email).toMatchObject({
      direction: "inbound",
      status: "received",
      resendId: "resend-inbound-1",
      subject: "Re: hello",
    });

    const recipients = await database
      .select()
      .from(EmailRecipientTable)
      .where(eq(EmailRecipientTable.emailId, emailId));

    // from + to + received_for
    expect(recipients).toHaveLength(3);
    expect(recipients.map((r) => r.type).sort()).toEqual([
      "from",
      "received_for",
      "to",
    ]);
  });

  it("returns the existing record on webhook replay instead of failing", async () => {
    const first = await emailService.createInboundEmailRecord(inboundPayload());
    // Replaying the same provider message must not violate the unique
    // `resend_id` index, which previously turned retries into a 500 loop.
    const second =
      await emailService.createInboundEmailRecord(inboundPayload());

    expect(second.duplicate).toBe(true);
    expect(second.emailId).toBe(first.emailId);

    const emails = await database.select().from(EmailTable);
    expect(emails).toHaveLength(1);
  });

  it("treats different provider ids as distinct emails", async () => {
    await emailService.createInboundEmailRecord(inboundPayload("a"));
    const { duplicate } = await emailService.createInboundEmailRecord(
      inboundPayload("b")
    );

    expect(duplicate).toBe(false);
    expect(await database.select().from(EmailTable)).toHaveLength(2);
  });
});

describe("getEmailByResendId", () => {
  beforeEach(async () => {
    await database.delete(EmailRecipientTable);
    await database.delete(EmailTable);
  });

  it("finds a stored email by its provider id", async () => {
    await emailService.createInboundEmailRecord(inboundPayload("lookup-1"));

    const found = await emailService.getEmailByResendId("lookup-1");

    expect(found?.resendId).toBe("lookup-1");
  });

  it("returns undefined for an unknown id", async () => {
    expect(await emailService.getEmailByResendId("nope")).toBeUndefined();
  });
});

describe("advanceEmailStatusByResendId", () => {
  const resendId = "re_webhook";
  const id = "33333333-3333-4333-8333-333333333333";

  beforeEach(async () => {
    await database.delete(EmailRecipientTable);
    await database.delete(EmailTable);
    await database.insert(EmailTable).values({
      id,
      direction: "outbound",
      status: "queued",
      resendId,
    });
  });

  async function currentStatus() {
    const [row] = await database
      .select({ status: EmailTable.status })
      .from(EmailTable)
      .where(eq(EmailTable.id, id));

    return row?.status;
  }

  it("advances by provider id", async () => {
    await expect(
      emailService.advanceEmailStatusByResendId(resendId, "delivered")
    ).resolves.toBe(true);
    expect(await currentStatus()).toBe("delivered");
  });

  it("is forward-only, like the local-id variant", async () => {
    await emailService.advanceEmailStatusByResendId(resendId, "delivered");

    await expect(
      emailService.advanceEmailStatusByResendId(resendId, "sent")
    ).resolves.toBe(false);
    expect(await currentStatus()).toBe("delivered");
  });

  it("does nothing for an unknown provider id", async () => {
    await expect(
      emailService.advanceEmailStatusByResendId("re_missing", "delivered")
    ).resolves.toBe(false);
  });
});
