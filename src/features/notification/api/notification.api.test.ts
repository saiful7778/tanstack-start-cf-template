import { readFileSync } from "node:fs";
import path from "node:path";

import { createMockDrizzleClient } from "#/db/clients/drizzle-client.mock";
import { UserTable } from "#/db/schemas";
import { router } from "#/oRPC/orpc.router";
import type { ORPCContext } from "#/types/orpc.types";
import { createRouterClient } from "@orpc/server";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { NotificationService } from "../server/notification.service";

vi.mock("worker-mailer", () => ({
  WorkerMailer: { connect: vi.fn() },
}));

const SCHEMA_SQL = readFileSync(
  path.resolve(process.cwd(), "full-schema.sql"),
  "utf8"
);

const database = createMockDrizzleClient();

const USER_ID = "11111111-1111-4111-8111-111111111111";

const hub = {
  publish: async () => ({ delivered: 0 }),
  unreadCount: async () => 0,
};

const service = new NotificationService(database, () => hub);

function createClient() {
  return createRouterClient(router, {
    context: (): ORPCContext => ({
      reqHeaders: new Headers(),
      db: database,
      user: { id: USER_ID, name: "Test", email: "test@example.com" } as never,
      session: { id: "session-1" } as never,
      roles: [],
      permissions: [],
    }),
  });
}

const client = createClient();

beforeAll(async () => {
  await database.$client.exec(SCHEMA_SQL);
});

beforeEach(async () => {
  await database.delete(UserTable);
  await database.insert(UserTable).values({
    id: USER_ID,
    name: "Test",
    email: "test@example.com",
    role: "USER",
  });
});

async function seedNotification(read = false) {
  const notification = await service.create({
    recipientId: USER_ID,
    category: "SYSTEM",
    level: "INFO",
    title: read ? "Read notice" : "New notice",
    message: "Something happened",
    isRead: read,
    isArchived: false,
  });

  // A seeded notification must exist; `null` means every channel was disabled.
  if (!notification) throw new Error("Failed to seed a notification");

  return notification;
}

describe("notification.list", () => {
  it("paginates the current user's notifications", async () => {
    await seedNotification();
    await seedNotification();

    const result = await client.notification.list({
      page: 1,
      limit: 10,
      searchFields: [],
    });

    expect(result.success).toBe(true);
    expect(result.data.data).toHaveLength(2);
    expect(result.data.meta).toMatchObject({
      currentPage: 1,
      totalCount: 2,
      isFirstPage: true,
    });
  });

  it("filters on isRead: false instead of dropping the filter", async () => {
    await seedNotification(false);
    await seedNotification(true);

    const result = await client.notification.list({
      page: 1,
      limit: 10,
      searchFields: [],
      filter: { isRead: false },
    });

    expect(result.data.data).toHaveLength(1);
    expect(result.data.data[0]).toMatchObject({ isRead: false });
  });
});

describe("notification.unreadCount", () => {
  it("counts only unread, non-archived notifications", async () => {
    await seedNotification(false);
    await seedNotification(true);

    const result = await client.notification.unreadCount();

    expect(result.data).toEqual({ count: 1 });
  });
});

describe("notification.markAsRead", () => {
  it("marks the given notifications and reports the updated count", async () => {
    const first = await seedNotification();
    const second = await seedNotification();

    const result = await client.notification.markAsRead({
      ids: [first.id, second.id],
    });

    expect(result.data).toEqual({ updated: 2 });
    await expect(client.notification.unreadCount()).resolves.toMatchObject({
      data: { count: 0 },
    });
  });

  it("ignores notifications owned by another recipient", async () => {
    const otherUserId = "22222222-2222-4222-8222-222222222222";

    await database.insert(UserTable).values({
      id: otherUserId,
      name: "Other",
      email: "other@example.com",
      role: "USER",
    });

    const other = await service.create({
      recipientId: otherUserId,
      category: "SYSTEM",
      level: "INFO",
      title: "Not yours",
      message: "Nope",
      isRead: false,
      isArchived: false,
    });

    if (!other) throw new Error("Failed to seed the other user's notification");

    const result = await client.notification.markAsRead({ ids: [other.id] });

    expect(result.data).toEqual({ updated: 0 });
  });
});

describe("notification.markAllAsRead", () => {
  it("marks every unread notification for the user", async () => {
    await seedNotification();
    await seedNotification();

    const result = await client.notification.markAllAsRead();

    expect(result.data).toEqual({ updated: 2 });
  });
});

describe("notification.settings", () => {
  it("returns the default channel settings for every category", async () => {
    const result = await client.notification.settings();

    expect(result.data).toHaveLength(3);
    expect(result.data[0]).toMatchObject({
      emailEnabled: true,
      pushEnabled: true,
      inAppEnabled: true,
    });
  });

  it("upserts a category setting", async () => {
    await client.notification.updateSettings({
      category: "AUTH",
      emailEnabled: false,
      pushEnabled: true,
      inAppEnabled: true,
    });

    const result = await client.notification.settings();
    const authSetting = result.data.find(
      (setting) => setting.category === "AUTH"
    );

    expect(authSetting).toMatchObject({ emailEnabled: false });
  });
});
