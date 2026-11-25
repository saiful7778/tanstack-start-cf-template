import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FakeWebSocket, makeDto } from "../notification.test-utils";
import {
  createNotificationRealtimeClient,
  parseServerMessage,
} from "./notification.socket";

describe("parseServerMessage", () => {
  it("decodes each frame type the durable object sends", () => {
    expect(
      parseServerMessage(
        JSON.stringify({
          type: "connected",
          recipientId: "user-1",
          unreadCount: 2,
        })
      )
    ).toMatchObject({ type: "connected", unreadCount: 2 });

    expect(
      parseServerMessage(JSON.stringify({ type: "pong", timestamp: 5 }))
    ).toMatchObject({ type: "pong" });

    expect(
      parseServerMessage(
        JSON.stringify({ type: "notification.unread_count", count: 4 })
      )
    ).toMatchObject({ type: "notification.unread_count", count: 4 });
  });

  it("decodes a valid created event", () => {
    const message = parseServerMessage(
      JSON.stringify({
        type: "notification.created",
        notification: makeDto(),
        unreadCount: 1,
      })
    );

    expect(message).toMatchObject({ type: "notification.created" });
  });

  it("rejects malformed, non-string and unknown frames", () => {
    expect(parseServerMessage("not json")).toBeNull();
    expect(parseServerMessage('{"type":"unknown.frame"}')).toBeNull();
    expect(parseServerMessage(new ArrayBuffer(8))).toBeNull();
    expect(parseServerMessage(null)).toBeNull();
    expect(parseServerMessage('{"type":"notification.created"}')).toBeNull();
  });
});

describe("createNotificationRealtimeClient", () => {
  beforeEach(() => {
    FakeWebSocket.reset();
    vi.stubGlobal("WebSocket", FakeWebSocket);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function setup() {
    const onMessage = vi.fn();
    const onStatusChange = vi.fn();

    const client = createNotificationRealtimeClient({
      url: "/api/notifications/ws",
      onMessage,
      onStatusChange,
    });

    return { client, onMessage, onStatusChange };
  }

  it("reports open status and requests the unread count", () => {
    const { client, onStatusChange } = setup();

    client.connect();
    FakeWebSocket.last.open();

    expect(onStatusChange).toHaveBeenCalledWith("open");
    expect(client.status()).toBe("open");
    expect(FakeWebSocket.last.sent).toContainEqual(
      JSON.stringify({ type: "unread_count" })
    );
  });

  it("forwards decoded messages only", () => {
    const { client, onMessage } = setup();

    client.connect();
    FakeWebSocket.last.open();
    FakeWebSocket.last.serverSendRaw("garbage");
    FakeWebSocket.last.serverSend({
      type: "notification.unread_count",
      count: 9,
    });

    expect(onMessage).toHaveBeenCalledTimes(1);
    expect(onMessage).toHaveBeenCalledWith({
      type: "notification.unread_count",
      count: 9,
    });
  });

  it("reconnects with backoff after a drop and resets on success", () => {
    const { client, onStatusChange } = setup();

    client.connect();
    FakeWebSocket.last.open();
    FakeWebSocket.last.serverClose();

    expect(client.status()).toBe("reconnecting");

    // First retry is 1s out.
    vi.advanceTimersByTime(999);
    expect(FakeWebSocket.instances).toHaveLength(1);

    vi.advanceTimersByTime(1);
    expect(FakeWebSocket.instances).toHaveLength(2);

    FakeWebSocket.instances[1]!.open();
    expect(client.status()).toBe("open");
    expect(onStatusChange).toHaveBeenCalledWith("reconnecting");
  });

  it("gives up after the reconnect budget", () => {
    const { client } = setup();

    client.connect();

    for (let attempt = 0; attempt <= 8; attempt += 1) {
      const socket = FakeWebSocket.last;

      socket.serverClose();
      vi.advanceTimersByTime(30_000);
    }

    expect(client.status()).toBe("closed");
  });

  it("stops reconnecting after disconnect", () => {
    const { client } = setup();

    client.connect();
    FakeWebSocket.last.open();

    const before = FakeWebSocket.instances.length;

    client.disconnect();
    vi.advanceTimersByTime(60_000);

    expect(FakeWebSocket.instances).toHaveLength(before);
    expect(client.status()).toBe("closed");
  });

  it("sends heartbeats while open", () => {
    const { client } = setup();

    client.connect();
    FakeWebSocket.last.open();
    FakeWebSocket.last.sent = [];

    vi.advanceTimersByTime(25_000);

    expect(FakeWebSocket.last.sent).toEqual([JSON.stringify({ type: "ping" })]);

    client.disconnect();
  });

  it("does not open twice when connect is called repeatedly", () => {
    const { client } = setup();

    client.connect();
    client.connect();

    expect(FakeWebSocket.instances).toHaveLength(1);

    client.disconnect();
  });
});
