import { readFileSync } from "node:fs";
import path from "node:path";

import { createMockDrizzleClient } from "#/db/clients/drizzle-client.mock";
import { UserTable } from "#/db/schemas";
import type { IMailService } from "#/mail/services/mail.service";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { NotificationDto } from "../notification.types";
import { createNotificationEmailDispatcher } from "./notification.email";

vi.mock("worker-mailer", () => ({
  WorkerMailer: { connect: vi.fn() },
}));

const SCHEMA_SQL = readFileSync(
  path.resolve(process.cwd(), "full-schema.sql"),
  "utf8"
);

const database = createMockDrizzleClient();

const USER_ID = "11111111-1111-4111-8111-111111111111";

/** Minimal stand-in for the mail service; only `sendNotificationMail` is used. */
function createFakeMail() {
  return {
    sendNotificationMail: vi.fn(async () => ({
      success: true,
      emailId: "email-1",
      threadId: "thread-1",
    })),
  } as unknown as IMailService & {
    sendNotificationMail: ReturnType<typeof vi.fn>;
  };
}

function makeNotification(
  overrides: Partial<NotificationDto> = {}
): NotificationDto {
  const now = new Date("2026-01-01T00:00:00.000Z").toISOString();

  return {
    id: "00000000-0000-4000-8000-000000000001",
    recipientId: USER_ID,
    actorId: null,
    category: "SYSTEM",
    level: "INFO",
    title: "Export ready",
    message: "Your report is ready to download",
    data: null,
    isRead: false,
    readAt: null,
    isArchived: false,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

async function seedUser({
  emailVerified = true,
  email = "test@example.com",
  name = "Test User",
} = {}) {
  await database.insert(UserTable).values({
    id: USER_ID,
    name,
    email,
    emailVerified,
    role: "USER",
  });
}

beforeAll(async () => {
  await database.$client.exec(SCHEMA_SQL);
});

beforeEach(async () => {
  vi.clearAllMocks();
  await database.delete(UserTable);
});

describe("createNotificationEmailDispatcher", () => {
  it("queues one mail to the recipient's verified address", async () => {
    await seedUser({ email: "verified@example.com", name: "Ada Lovelace" });
    const mail = createFakeMail();
    const dispatcher = createNotificationEmailDispatcher({ database, mail });

    const result = await dispatcher.dispatch(makeNotification());

    expect(result).toEqual({ accepted: 1 });
    expect(mail.sendNotificationMail).toHaveBeenCalledTimes(1);
    expect(mail.sendNotificationMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "verified@example.com",
        userName: "Ada Lovelace",
        title: "Export ready",
        message: "Your report is ready to download",
        category: "System",
        level: "Info",
      })
    );
  });

  it("formats the category and level for display", async () => {
    await seedUser();
    const mail = createFakeMail();
    const dispatcher = createNotificationEmailDispatcher({ database, mail });

    await dispatcher.dispatch(
      makeNotification({ category: "SUPPORT", level: "WARNING" })
    );

    expect(mail.sendNotificationMail).toHaveBeenCalledWith(
      expect.objectContaining({ category: "Support", level: "Warning" })
    );
  });

  it("skips an unverified address without touching the mail service", async () => {
    await seedUser({ emailVerified: false });
    const mail = createFakeMail();
    const dispatcher = createNotificationEmailDispatcher({ database, mail });

    const result = await dispatcher.dispatch(makeNotification());

    expect(result).toEqual({
      accepted: 0,
      skipped: "unverified_recipient",
    });
    expect(mail.sendNotificationMail).not.toHaveBeenCalled();
  });

  it("skips a missing recipient", async () => {
    const mail = createFakeMail();
    const dispatcher = createNotificationEmailDispatcher({ database, mail });

    const result = await dispatcher.dispatch(makeNotification());

    expect(result).toEqual({ accepted: 0, skipped: "no_recipient" });
    expect(mail.sendNotificationMail).not.toHaveBeenCalled();
  });

  it("skips a notification that is already read", async () => {
    await seedUser();
    const mail = createFakeMail();
    const dispatcher = createNotificationEmailDispatcher({ database, mail });

    const result = await dispatcher.dispatch(
      makeNotification({ isRead: true, readAt: "2026-01-02T00:00:00.000Z" })
    );

    expect(result).toEqual({ accepted: 0, skipped: "already_read" });
    expect(mail.sendNotificationMail).not.toHaveBeenCalled();
  });

  it("reports a mail service failure without throwing", async () => {
    await seedUser();
    const mail = createFakeMail();
    mail.sendNotificationMail.mockResolvedValueOnce({
      success: false,
      error: "queue unavailable",
    });
    const dispatcher = createNotificationEmailDispatcher({ database, mail });

    const result = await dispatcher.dispatch(makeNotification());

    expect(result).toEqual({ accepted: 0, error: "queue unavailable" });
  });

  it("defaults the error when the mail service gives no reason", async () => {
    await seedUser();
    const mail = createFakeMail();
    mail.sendNotificationMail.mockResolvedValueOnce({ success: false });
    const dispatcher = createNotificationEmailDispatcher({ database, mail });

    const result = await dispatcher.dispatch(makeNotification());

    expect(result.accepted).toBe(0);
    expect(result.error).toBeTruthy();
  });
});
