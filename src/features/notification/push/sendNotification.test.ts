import { readFileSync } from "node:fs";
import path from "node:path";

import { createMockDrizzleClient } from "#/db/clients/drizzle-client.mock";
import {
  NotificationSettingsTable,
  NotificationTable,
  PushSubscriptionTable,
  UserTable,
} from "#/db/schemas";
import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { type NotificationEmailDispatcher } from "../email/notification.email";
import type {
  NotificationHub,
  NotificationHubSource,
} from "../server/notification.hub.server";
import {
  NotificationService,
  toNotificationDto,
} from "../server/notification.service";
import {
  createWebPushDispatcher,
  type NotificationPushDispatcher,
} from "./push.dispatcher";
import { sendNotification } from "./sendNotification";

vi.mock("worker-mailer", () => ({
  WorkerMailer: { connect: vi.fn() },
}));

// The real web-push client opens TLS sockets, which jsdom cannot do. The module
// is mocked so the delivery policy can be asserted instead.
const pushMock = vi.hoisted(() => ({
  sendNotification: vi.fn(),
}));

vi.mock("web-push", () => {
  class WebPushError extends Error {
    constructor(
      message: string,
      public readonly statusCode: number
    ) {
      super(message);
    }
  }

  return { sendNotification: pushMock.sendNotification, WebPushError };
});

const { WebPushError } = await import("web-push");

const envMock = vi.hoisted(
  (): {
    WEB_PUSH_PRIVATE_KEY: string | undefined;
    VITE_WEB_PUSH_PUBLIC_KEY: string | undefined;
    VITE_SUPPORT_MAIL: string;
  } => ({
    WEB_PUSH_PRIVATE_KEY: "private-key",
    VITE_WEB_PUSH_PUBLIC_KEY: "public-key",
    VITE_SUPPORT_MAIL: "support@example.com",
  })
);

vi.mock("#/lib/env", () => ({ env: envMock }));

/**
 * Narrow the mocked constructor.
 *
 * `vi.mock` replaces the class, so the imported type describes the real
 * signature; this reads the mock's actual two-argument shape.
 */
const PushError = WebPushError as unknown as new (
  message: string,
  statusCode: number
) => Error;

const SCHEMA_SQL = readFileSync(
  path.resolve(process.cwd(), "full-schema.sql"),
  "utf8"
);

const database = createMockDrizzleClient();

const USER_ID = "11111111-1111-4111-8111-111111111111";

const publish = vi.fn(async () => ({ delivered: 1 }));

const hub: NotificationHub = { publish, unreadCount: async () => 0 };

const hubFor: NotificationHubSource = () => hub;

function payload(overrides: Record<string, unknown> = {}) {
  return {
    recipientId: USER_ID,
    category: "SYSTEM" as const,
    level: "INFO" as const,
    title: "Heads up",
    message: "Something happened",
    isRead: false,
    isArchived: false,
    ...overrides,
  };
}

/** A push dispatcher that records the notifications it was asked to send. */
function createFakeDispatcher(): NotificationPushDispatcher & {
  dispatch: ReturnType<typeof vi.fn>;
} {
  return {
    dispatch: vi.fn(async () => ({ delivered: 0, pruned: 0 })),
  };
}

/** An email dispatcher that records the notifications it was asked to send. */
function createFakeEmailDispatcher(): NotificationEmailDispatcher & {
  dispatch: ReturnType<typeof vi.fn>;
} {
  return {
    dispatch: vi.fn(async () => ({ accepted: 1 })),
  };
}

async function seedPushSubscription(endpoint: string) {
  await database.insert(PushSubscriptionTable).values({
    userId: USER_ID,
    endpoint,
    p256dh: "p256dh",
    auth: "auth",
  });
}

/**
 * Seed a settings row for the SYSTEM category.
 *
 * `emailEnabled` is pinned off by default here: the column defaults to `true`
 * in the schema, so an explicit `false` keeps these tests independent of that
 * default.
 */
async function seedSettings(settings: {
  inAppEnabled: boolean;
  pushEnabled: boolean;
  emailEnabled?: boolean;
}) {
  await database.insert(NotificationSettingsTable).values({
    userId: USER_ID,
    category: "SYSTEM",
    emailEnabled: false,
    ...settings,
  });
}

async function listNotifications() {
  return await database
    .select()
    .from(NotificationTable)
    .where(eq(NotificationTable.recipientId, USER_ID));
}

beforeAll(async () => {
  await database.$client.exec(SCHEMA_SQL);
});

beforeEach(async () => {
  vi.clearAllMocks();
  envMock.WEB_PUSH_PRIVATE_KEY = "private-key";
  envMock.VITE_WEB_PUSH_PUBLIC_KEY = "public-key";
  pushMock.sendNotification.mockResolvedValue({ statusCode: 201 });

  await database.delete(NotificationTable);
  await database.delete(PushSubscriptionTable);
  await database.delete(NotificationSettingsTable);
  await database.delete(UserTable);
  await database.insert(UserTable).values({
    id: USER_ID,
    name: "Test",
    email: "test@example.com",
    role: "USER",
  });
});

describe("NotificationService.create", () => {
  it("stores the row and broadcasts it to the recipient's live sockets", async () => {
    const service = new NotificationService(database, hubFor);

    const notification = await service.create(payload());

    expect(notification).not.toBeNull();
    expect(publish).toHaveBeenCalledTimes(1);

    const [event] = publish.mock.calls[0] as unknown as [
      { type: string; notification: { id: string; title: string } },
    ];

    expect(event.type).toBe("notification.created");
    expect(event.notification.id).toBe(notification!.id);
    expect(event.notification.title).toBe("Heads up");
  });

  it("keeps the row when the broadcast fails", async () => {
    publish.mockRejectedValueOnce(new Error("durable object down"));

    const service = new NotificationService(database, hubFor);
    const result = await service.createWithResult(payload());

    expect(result.notification).not.toBeNull();
    expect(result.delivery.inApp.outcome).toBe("failed");
    expect(await listNotifications()).toHaveLength(1);
  });

  it("stores nothing when the recipient disabled every channel", async () => {
    await seedSettings({
      inAppEnabled: false,
      pushEnabled: false,
      emailEnabled: false,
    });

    const service = new NotificationService(database, hubFor);
    const result = await service.createWithResult(payload());

    expect(result.notification).toBeNull();
    expect(result.channels).toEqual({
      inApp: false,
      push: false,
      email: false,
    });
    expect(await listNotifications()).toHaveLength(0);
    expect(publish).not.toHaveBeenCalled();
  });

  it("runs only in-app when push is disabled", async () => {
    await seedSettings({
      inAppEnabled: true,
      pushEnabled: false,
      emailEnabled: false,
    });
    const push = createFakeDispatcher();

    const service = new NotificationService(database, hubFor, { push });
    const result = await service.createWithResult(payload());

    expect(result.channels).toEqual({
      inApp: true,
      push: false,
      email: false,
    });
    expect(result.delivery.inApp.outcome).toBe("delivered");
    expect(push.dispatch).not.toHaveBeenCalled();
  });

  it("runs only push when in-app is disabled", async () => {
    await seedSettings({ inAppEnabled: false, pushEnabled: true });
    const push = createFakeDispatcher();

    const service = new NotificationService(database, hubFor, { push });
    const result = await service.createWithResult(payload());

    expect(result.delivery.inApp.outcome).toBe("disabled");
    expect(result.delivery.push.outcome).not.toBe("disabled");
    expect(push.dispatch).toHaveBeenCalledTimes(1);
    expect(publish).not.toHaveBeenCalled();
  });

  it("honours an explicit channel override instead of the settings", async () => {
    await seedSettings({ inAppEnabled: false, pushEnabled: false });
    const push = createFakeDispatcher();

    const service = new NotificationService(database, hubFor, { push });
    const result = await service.createWithResult(payload(), {
      channels: { inApp: true, push: true, email: false },
    });

    expect(result.notification).not.toBeNull();
    expect(result.channels).toEqual({ inApp: true, push: true, email: false });
    expect(publish).toHaveBeenCalledTimes(1);
    expect(push.dispatch).toHaveBeenCalledTimes(1);
  });

  it("applies the insert schema so a minimal payload is still valid", async () => {
    const service = new NotificationService(database, hubFor);

    const notification = await service.create({
      recipientId: USER_ID,
      category: "SYSTEM",
      title: "No level given",
      message: "Defaults apply",
    });

    expect(notification).toMatchObject({
      level: "INFO",
      isRead: false,
      isArchived: false,
    });
  });

  it("does not use a push transport unless one is provided", async () => {
    const service = new NotificationService(database, hubFor);
    const result = await service.createWithResult(payload());

    // No dispatcher injected: push is a no-op, not an error.
    expect(result.channels.push).toBe(true);
    expect(result.delivery.push.detail).toEqual({ delivered: 0, pruned: 0 });
  });

  it("contains a throwing push dispatcher", async () => {
    const push: NotificationPushDispatcher = {
      dispatch: vi.fn(async () => {
        throw new Error("push exploded");
      }),
    };

    const service = new NotificationService(database, hubFor, { push });
    const result = await service.createWithResult(payload());

    expect(result.notification).not.toBeNull();
    expect(result.delivery.push.outcome).toBe("failed");
    expect(result.delivery.push.detail).toEqual({ delivered: 0, pruned: 0 });
  });
});

describe("NotificationService email channel", () => {
  it("is off when no settings row exists, so existing users are not mailed", async () => {
    const email = createFakeEmailDispatcher();
    const service = new NotificationService(database, hubFor, { email });

    const result = await service.createWithResult(payload());

    expect(result.channels.email).toBe(false);
    expect(email.dispatch).not.toHaveBeenCalled();
    expect(result.delivery.email.outcome).toBe("disabled");
  });

  it("runs when the recipient explicitly enabled it", async () => {
    await seedSettings({
      inAppEnabled: false,
      pushEnabled: false,
      emailEnabled: true,
    });
    const email = createFakeEmailDispatcher();
    const service = new NotificationService(database, hubFor, { email });

    const result = await service.createWithResult(payload());

    expect(result.channels).toEqual({
      inApp: false,
      push: false,
      email: true,
    });
    expect(email.dispatch).toHaveBeenCalledTimes(1);
    expect(result.notification).not.toBeNull();
  });

  it("stays off when the recipient explicitly disabled it", async () => {
    await seedSettings({
      inAppEnabled: true,
      pushEnabled: false,
      emailEnabled: false,
    });
    const email = createFakeEmailDispatcher();
    const service = new NotificationService(database, hubFor, { email });

    const result = await service.createWithResult(payload());

    expect(result.channels.email).toBe(false);
    expect(result.delivery.email.outcome).toBe("disabled");
    expect(email.dispatch).not.toHaveBeenCalled();
  });

  it("is forced on by an explicit override", async () => {
    const email = createFakeEmailDispatcher();
    const service = new NotificationService(database, hubFor, { email });

    const result = await service.createWithResult(payload(), {
      channels: { inApp: false, push: false, email: true },
    });

    expect(email.dispatch).toHaveBeenCalledTimes(1);
    expect(result.notification).not.toBeNull();
  });

  it("contains a throwing email dispatcher", async () => {
    const email: NotificationEmailDispatcher = {
      dispatch: vi.fn(async () => {
        throw new Error("mail exploded");
      }),
    };

    const service = new NotificationService(database, hubFor, { email });
    const result = await service.createWithResult(payload(), {
      channels: { inApp: false, push: false, email: true },
    });

    expect(result.notification).not.toBeNull();
    expect(result.delivery.email.outcome).toBe("failed");
    expect(await listNotifications()).toHaveLength(1);
  });
});

describe("sendNotification", () => {
  it("stores the row and reports in-app delivery", async () => {
    const { notification, delivery } = await sendNotification({
      database,
      payload: payload(),
      hubFor,
      push: createFakeDispatcher(),
      email: createFakeEmailDispatcher(),
    });

    expect(notification).toMatchObject({ title: "Heads up" });
    expect(delivery.inApp.outcome).toBe("delivered");
    expect(publish).toHaveBeenCalledTimes(1);
    expect(await listNotifications()).toHaveLength(1);
  });

  it("returns null and reports every channel disabled", async () => {
    await seedSettings({
      inAppEnabled: false,
      pushEnabled: false,
      emailEnabled: false,
    });

    const { notification, delivery } = await sendNotification({
      database,
      payload: payload(),
      hubFor,
      push: createFakeDispatcher(),
      email: createFakeEmailDispatcher(),
    });

    expect(notification).toBeNull();
    expect(delivery.inApp.outcome).toBe("disabled");
    expect(delivery.push.outcome).toBe("disabled");
    expect(delivery.email.outcome).toBe("disabled");
    expect(await listNotifications()).toHaveLength(0);
  });

  it("runs push and email when the settings enable them", async () => {
    const push = createFakeDispatcher();
    const email = createFakeEmailDispatcher();

    await sendNotification({
      database,
      payload: payload(),
      hubFor,
      push,
      email,
      // Email is off by default for existing users, so force the full set.
      channels: { inApp: true, push: true, email: true },
    });

    expect(push.dispatch).toHaveBeenCalledTimes(1);
    expect(email.dispatch).toHaveBeenCalledTimes(1);
  });

  it("wires a real email dispatcher when none is injected", async () => {
    // Guards the regression where the wrapper omitted email entirely, making
    // the channel a silent no-op for every caller.
    const { delivery } = await sendNotification({
      database,
      payload: payload(),
      hubFor,
      push: createFakeDispatcher(),
      channels: { inApp: false, push: false, email: true },
    });

    // No dispatcher injected: the real one runs and reaches the database. The
    // test user has no verified address, so it reports a skip rather than
    // "disabled" or a crash.
    expect(delivery.email.outcome).toBe("delivered");
    expect(delivery.email.detail).toEqual({
      accepted: 0,
      skipped: "unverified_recipient",
    });
  });

  it("keeps the row when every channel fails", async () => {
    publish.mockRejectedValueOnce(new Error("socket down"));

    const { notification, delivery } = await sendNotification({
      database,
      payload: payload(),
      hubFor,
      push: {
        dispatch: async () => {
          throw new Error("push down");
        },
      },
      email: {
        dispatch: async () => {
          throw new Error("mail down");
        },
      },
      channels: { inApp: true, push: true, email: true },
    });

    expect(notification).not.toBeNull();
    expect(delivery.delivered).toBe(false);
    expect(await listNotifications()).toHaveLength(1);
  });
});

describe("createWebPushDispatcher", () => {
  it("sends to every registered device", async () => {
    await seedPushSubscription("https://push.example/one");
    await seedPushSubscription("https://push.example/two");

    const result = await createWebPushDispatcher(database).dispatch(
      await createStoredNotification()
    );

    expect(result).toEqual({ delivered: 2, pruned: 0 });
    expect(pushMock.sendNotification).toHaveBeenCalledTimes(2);
  });

  it("skips sending when VAPID keys are missing", async () => {
    envMock.WEB_PUSH_PRIVATE_KEY = undefined;
    await seedPushSubscription("https://push.example/one");

    const result = await createWebPushDispatcher(database).dispatch(
      await createStoredNotification()
    );

    // No send is attempted, and the skip is logged (not thrown).
    expect(result).toEqual({ delivered: 0, pruned: 0 });
    expect(pushMock.sendNotification).not.toHaveBeenCalled();
  });

  it("prunes a subscription the push service reports as gone", async () => {
    await seedPushSubscription("https://push.example/gone");
    pushMock.sendNotification.mockRejectedValueOnce(new PushError("gone", 410));

    const result = await createWebPushDispatcher(database).dispatch(
      await createStoredNotification()
    );

    expect(result).toEqual({ delivered: 0, pruned: 1 });
    expect(await database.select().from(PushSubscriptionTable)).toHaveLength(0);
  });

  it("keeps a subscription after a transient failure", async () => {
    await seedPushSubscription("https://push.example/flaky");
    pushMock.sendNotification.mockRejectedValueOnce(
      new PushError("server error", 500)
    );

    const result = await createWebPushDispatcher(database).dispatch(
      await createStoredNotification()
    );

    expect(result).toEqual({ delivered: 0, pruned: 0 });
    expect(await database.select().from(PushSubscriptionTable)).toHaveLength(1);
  });

  it("counts only the deliveries that succeeded", async () => {
    await seedPushSubscription("https://push.example/ok");
    await seedPushSubscription("https://push.example/bad");

    pushMock.sendNotification
      .mockResolvedValueOnce({ statusCode: 201 })
      .mockRejectedValueOnce(new PushError("boom", 500));

    const result = await createWebPushDispatcher(database).dispatch(
      await createStoredNotification()
    );

    expect(result.delivered).toBe(1);
  });
});

/** Insert a row directly, so dispatcher tests are decoupled from the service. */
async function createStoredNotification() {
  const [row] = await database
    .insert(NotificationTable)
    .values(payload())
    .returning();

  if (!row) throw new Error("Failed to insert a notification");

  return toNotificationDto(row);
}
