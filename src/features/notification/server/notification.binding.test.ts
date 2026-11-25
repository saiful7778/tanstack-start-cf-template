import { beforeEach, describe, expect, it, vi } from "vitest";

import { NOTIFICATION_INTERNAL_ORIGIN } from "../notification.constants";
import { NotificationError } from "../notification.error";
import {
  bindNotificationHub,
  getNotificationStub,
} from "./notification.binding";

const fetchMock = vi.fn();

function createEnv() {
  const id = { name: "user-1" };
  const stub = { fetch: fetchMock };

  return {
    env: {
      NOTIFICATIONS: {
        idFromName: vi.fn(() => id),
        get: vi.fn(() => stub),
      },
    } as unknown as Env,
    id,
    stub,
  };
}

const event = { type: "notification.unread_count" as const, count: 3 };

describe("getNotificationStub", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("addresses the durable object by recipient id", () => {
    const { env, id, stub } = createEnv();

    expect(getNotificationStub(env, "user-1")).toBe(stub);
    expect(env.NOTIFICATIONS.idFromName).toHaveBeenCalledWith("user-1");
    expect(env.NOTIFICATIONS.get).toHaveBeenCalledWith(id);
  });
});

describe("bindNotificationHub", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("posts a validated event to the recipient's durable object", async () => {
    const { env } = createEnv();
    fetchMock.mockResolvedValue(Response.json({ delivered: 2 }));

    const result = await bindNotificationHub(env, "user-1").publish(event);

    expect(fetchMock).toHaveBeenCalledWith(
      `${NOTIFICATION_INTERNAL_ORIGIN}/broadcast`,
      expect.objectContaining({ method: "POST" })
    );

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];

    expect(JSON.parse(init.body as string)).toEqual(event);
    expect(result).toEqual({ delivered: 2 });
  });

  it("rejects when the durable object refuses the event", async () => {
    const { env } = createEnv();
    fetchMock.mockResolvedValue(new Response("nope", { status: 503 }));

    await expect(
      bindNotificationHub(env, "user-1").publish(event)
    ).rejects.toBeInstanceOf(NotificationError);
  });

  it("reads the unread count from the durable object", async () => {
    const { env } = createEnv();
    fetchMock.mockResolvedValue(Response.json({ count: 5 }));

    await expect(
      bindNotificationHub(env, "user-1").unreadCount()
    ).resolves.toBe(5);

    expect(fetchMock).toHaveBeenCalledWith(
      `${NOTIFICATION_INTERNAL_ORIGIN}/unread-count`
    );
  });
});
