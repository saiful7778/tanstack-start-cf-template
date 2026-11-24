import { readFileSync } from "node:fs";
import path from "node:path";

import { createMockDrizzleClient } from "#/db/clients/drizzle-client.mock";
import { EmailTable } from "#/db/schemas";
import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { EmailService } from "../services/email.service";
import { applyResendEvent } from "./resendEvent.handler";

const SCHEMA_SQL = readFileSync(
  path.resolve(process.cwd(), "full-schema.sql"),
  "utf8"
);

const { updateEmailByResendId, advanceEmailStatus } = vi.hoisted(() => ({
  updateEmailByResendId: vi.fn(),
  advanceEmailStatus: vi.fn(),
}));

function service() {
  return {
    updateEmailByResendId,
    advanceEmailStatusByResendId: advanceEmailStatus,
  } as unknown as EmailService;
}

function deliveredEvent(emailId = "email-1") {
  return {
    type: "email.delivered",
    created_at: "2026-11-25T00:00:00.000Z",
    data: {
      email_id: emailId,
      message_id: "<msg@x>",
      from: "a@x.com",
      to: ["b@x.com"],
      subject: "s",
      created_at: "2026-11-25T00:00:00.000Z",
    },
  };
}

describe("applyResendEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    advanceEmailStatus.mockResolvedValue(true);
  });

  it("records the provider message id and advances the status", async () => {
    const outcome = await applyResendEvent(
      deliveredEvent() as never,
      service()
    );

    expect(updateEmailByResendId).toHaveBeenCalledWith("email-1", {
      resendMessageId: "msg@x",
    });
    expect(advanceEmailStatus).toHaveBeenCalledWith("email-1", "delivered");
    expect(outcome).toEqual({
      handled: true,
      emailId: "email-1",
      status: "delivered",
      applied: true,
    });
  });

  it("reports applied false when the status was already reached", async () => {
    advanceEmailStatus.mockResolvedValue(false);

    const outcome = await applyResendEvent(
      deliveredEvent() as never,
      service()
    );

    expect(outcome.applied).toBe(false);
  });

  it("still records the message id for a replayed event", async () => {
    advanceEmailStatus.mockResolvedValue(false);

    await applyResendEvent(deliveredEvent() as never, service());

    expect(updateEmailByResendId).toHaveBeenCalledTimes(1);
  });

  it.each(["email.opened", "email.clicked", "email.scheduled"])(
    "acknowledges %s without writing",
    async (type) => {
      const outcome = await applyResendEvent(
        { ...deliveredEvent(), type: type as never },
        service()
      );
      expect(outcome.handled).toBe(false);
      expect(advanceEmailStatus).not.toHaveBeenCalled();
      expect(updateEmailByResendId).not.toHaveBeenCalled();
    }
  );

  it("ignores non-email events that share no data shape", async () => {
    const outcome = await applyResendEvent(
      {
        type: "contact.created",
        created_at: "x",
        data: { id: "c1" },
      } as never,
      service()
    );

    expect(outcome.handled).toBe(false);
  });
});

describe("advanceEmailStatus (by local id)", () => {
  const database = createMockDrizzleClient();
  const emailService = new EmailService(database);
  const resendId = "re_abc";
  const emailId = "11111111-1111-4111-8111-111111111111";

  beforeAll(async () => {
    // The in-memory mock starts empty; apply the shipped schema once.
    await database.$client.exec(SCHEMA_SQL);
  });

  beforeEach(async () => {
    await database.delete(EmailTable);
    await database.insert(EmailTable).values({
      id: emailId,
      direction: "outbound",
      status: "queued",
      resendId,
    });
  });

  async function currentStatus() {
    const [row] = await database
      .select({ status: EmailTable.status })
      .from(EmailTable)
      .where(eq(EmailTable.id, emailId));

    return row?.status;
  }

  it("moves a queued email forward", async () => {
    await expect(
      emailService.advanceEmailStatus(emailId, "sent")
    ).resolves.toBe(true);
    expect(await currentStatus()).toBe("sent");
  });

  it("does not regress delivered back to sent", async () => {
    await emailService.advanceEmailStatus(emailId, "delivered");

    await expect(
      emailService.advanceEmailStatus(emailId, "sent")
    ).resolves.toBe(false);
    expect(await currentStatus()).toBe("delivered");
  });

  it("treats a replay as a no-op", async () => {
    await emailService.advanceEmailStatus(emailId, "delivered");

    await expect(
      emailService.advanceEmailStatus(emailId, "delivered")
    ).resolves.toBe(false);
    expect(await currentStatus()).toBe("delivered");
  });

  it("applies a terminal failure after delivery", async () => {
    await emailService.advanceEmailStatus(emailId, "delivered");

    await expect(
      emailService.advanceEmailStatus(emailId, "bounced")
    ).resolves.toBe(true);
    expect(await currentStatus()).toBe("bounced");
  });

  it("writes extra fields alongside the status", async () => {
    await emailService.advanceEmailStatus(emailId, "sent", {
      resendMessageId: "msg-1",
    });

    const [row] = await database
      .select({ resendMessageId: EmailTable.resendMessageId })
      .from(EmailTable)
      .where(eq(EmailTable.id, emailId));

    expect(row?.resendMessageId).toBe("msg-1");
  });
});
