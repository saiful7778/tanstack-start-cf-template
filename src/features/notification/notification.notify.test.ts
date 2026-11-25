import { readFileSync } from "node:fs";
import path from "node:path";

import { createMockDrizzleClient } from "#/db/clients/drizzle-client.mock";
import { NotificationTable, UserTable } from "#/db/schemas";
import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { notifyUser } from "./notification.notify";

vi.mock("worker-mailer", () => ({
  WorkerMailer: { connect: vi.fn() },
}));

const SCHEMA_SQL = readFileSync(
  path.resolve(process.cwd(), "full-schema.sql"),
  "utf8"
);

const database = createMockDrizzleClient();

const RECIPIENT_ID = "11111111-1111-4111-8111-111111111111";
const ACTOR_ID = "22222222-2222-4222-8222-222222222222";

async function seedUsers() {
  await database.insert(UserTable).values([
    {
      id: RECIPIENT_ID,
      name: "Recipient",
      email: "recipient@example.com",
      role: "USER",
    },
    {
      id: ACTOR_ID,
      name: "Actor",
      email: "actor@example.com",
      role: "ADMIN",
    },
  ]);
}

async function listNotifications() {
  return await database
    .select()
    .from(NotificationTable)
    .where(eq(NotificationTable.recipientId, RECIPIENT_ID));
}

beforeAll(async () => {
  await database.$client.exec(SCHEMA_SQL);
});

beforeEach(async () => {
  vi.clearAllMocks();
  await database.delete(NotificationTable);
  await database.delete(UserTable);
  await seedUsers();
});

describe("notifyUser", () => {
  it("stores the notification for the recipient", async () => {
    const report = await notifyUser({
      database,
      recipientId: RECIPIENT_ID,
      actorId: ACTOR_ID,
      category: "SYSTEM",
      level: "WARNING",
      title: "Your account has been banned",
      message: "Banned for spam.",
      data: { reason: "spam" },
    });

    const rows = await listNotifications();

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      recipientId: RECIPIENT_ID,
      actorId: ACTOR_ID,
      category: "SYSTEM",
      level: "WARNING",
      title: "Your account has been banned",
      message: "Banned for spam.",
      data: { reason: "spam" },
    });
    expect(report).not.toBeNull();
  });

  it("skips notifying when the actor is the recipient", async () => {
    const report = await notifyUser({
      database,
      recipientId: RECIPIENT_ID,
      actorId: RECIPIENT_ID,
      category: "SYSTEM",
      level: "INFO",
      title: "Your role has changed",
      message: "Role changed.",
    });

    expect(report).toBeNull();
    expect(await listNotifications()).toHaveLength(0);
  });

  it("never throws when delivery fails", async () => {
    // A nonexistent recipient violates the foreign key on insert.
    const report = await notifyUser({
      database,
      recipientId: "33333333-3333-4333-8333-333333333333",
      category: "SYSTEM",
      level: "INFO",
      title: "Hello",
      message: "This recipient does not exist.",
    });

    expect(report).toBeNull();
  });

  it("reports a delivery where no channel succeeded without throwing", async () => {
    const report = await notifyUser({
      database,
      recipientId: RECIPIENT_ID,
      category: "SYSTEM",
      level: "INFO",
      title: "Heads up",
      message: "Something happened.",
      // No Durable Object binding in tests, so in-app cannot reach a hub; push
      // and email are no-ops here. The row is still stored.
    });

    expect(await listNotifications()).toHaveLength(1);
    expect(report).not.toBeNull();
    expect(report?.inApp.outcome).not.toBe("delivered");
  });
});
