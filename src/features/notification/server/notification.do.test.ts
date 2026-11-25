import { beforeEach, describe, expect, it, vi } from "vitest";

import { NotificationDurableObject } from "./notification.do";

const { createDrizzleClient } = vi.hoisted(() => ({
  createDrizzleClient: vi.fn(),
}));

vi.mock("#/db/clients/drizzle-client", () => ({ createDrizzleClient }));

function createSocket() {
  return {
    readyState: 1,
    sent: [] as string[],
    send(data: string) {
      this.sent.push(data);
    },
    close: vi.fn(),
  };
}

function createObject(sockets: ReturnType<typeof createSocket>[] = []) {
  const ctx = {
    id: { name: "user-1" },
    acceptWebSocket: vi.fn(),
    getWebSockets: vi.fn(() => sockets),
  } as unknown as DurableObjectState;

  return new NotificationDurableObject(ctx, { DB: {} } as Env);
}

function broadcastRequest(body: unknown) {
  return new Request("https://notification.internal/broadcast", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("NotificationDurableObject", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fans a notification event out to every open socket", async () => {
    const first = createSocket();
    const second = createSocket();
    const instance = createObject([first, second]);
    const event = {
      type: "notification.read_all" as const,
      readAt: new Date().toISOString(),
      unreadCount: 0,
    };

    const response = await instance.fetch(broadcastRequest(event));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ delivered: 2 });
    expect(JSON.parse(first.sent[0]!)).toEqual(event);
    expect(JSON.parse(second.sent[0]!)).toEqual(event);
  });

  it("rejects an invalid event without touching the sockets", async () => {
    const socket = createSocket();
    const instance = createObject([socket]);

    const response = await instance.fetch(
      broadcastRequest({ type: "notification.created" })
    );

    expect(response.status).toBe(400);
    expect(socket.sent).toEqual([]);
  });

  it("refuses to broadcast another recipient's notification", async () => {
    const socket = createSocket();
    const instance = createObject([socket]);

    const response = await instance.fetch(
      broadcastRequest({
        type: "notification.created",
        notification: {
          id: "00000000-0000-4000-8000-000000000001",
          recipientId: "00000000-0000-4000-8000-000000000002",
          actorId: null,
          category: "SYSTEM",
          level: "INFO",
          title: "Not yours",
          message: "Should not be delivered",
          data: null,
          isRead: false,
          readAt: null,
          isArchived: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        unreadCount: 1,
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Notification recipient mismatch",
    });
    expect(socket.sent).toEqual([]);
  });

  it("answers ping and rejects malformed client messages", async () => {
    const socket = createSocket();
    const instance = createObject([socket]);

    await instance.webSocketMessage(
      socket as unknown as WebSocket,
      JSON.stringify({ type: "ping" })
    );
    await instance.webSocketMessage(socket as unknown as WebSocket, "not-json");

    expect(JSON.parse(socket.sent[0]!).type).toBe("pong");
    expect(JSON.parse(socket.sent[1]!)).toMatchObject({ type: "error" });
  });

  it("serves the unread count from D1", async () => {
    const where = vi.fn().mockResolvedValue([{ count: 4 }]);
    const from = vi.fn(() => ({ where }));
    const select = vi.fn(() => ({ from }));

    createDrizzleClient.mockReturnValue({ select });

    const instance = createObject();
    const response = await instance.fetch(
      new Request("https://notification.internal/unread-count")
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ count: 4 });
    expect(createDrizzleClient).toHaveBeenCalledWith({});
  });
});
