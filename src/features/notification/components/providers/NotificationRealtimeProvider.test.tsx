import { orpcTQClient } from "#/oRPC/orpc";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_LIST_INPUT,
  FakeWebSocket,
  makeDto,
  makeListResponse,
} from "../../notification.test-utils";
import type { NotificationListResponse } from "../../realtime/notification.realtime";
import { NotificationRealtimeProvider } from "./NotificationRealtimeProvider";

// `orpc` imports the server router, which pulls in worker-mailer; it needs
// `cloudflare:sockets`, which does not exist outside workerd. `vi.mock` is
// hoisted above the imports, so declaring it here still applies.
vi.mock("worker-mailer", () => ({
  WorkerMailer: { connect: vi.fn() },
}));

const listKey = orpcTQClient.notification.list.queryKey({
  input: DEFAULT_LIST_INPUT,
});
const unreadKey = orpcTQClient.notification.unreadCount.queryKey();

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });

  function Consumer() {
    // Real observers over the same cache entries the list/badge use, so the
    // test fails if the provider writes to a different key. `enabled: false`
    // keeps the harness from firing a network request.
    const list = useQuery({
      queryKey: orpcTQClient.notification.list.queryOptions({
        input: DEFAULT_LIST_INPUT,
      }).queryKey,
      queryFn: () => Promise.reject(new Error("not fetched in this test")),
      enabled: false,
    });
    const unread = useQuery({
      queryKey: orpcTQClient.notification.unreadCount.queryOptions().queryKey,
      queryFn: () => Promise.reject(new Error("not fetched in this test")),
      enabled: false,
    });

    const listData = list.data as NotificationListResponse | undefined;
    const unreadData = unread.data as { data: { count: number } } | undefined;

    return (
      <div>
        <span data-testid="list-count">{listData?.data.data.length ?? -1}</span>
        <span data-testid="list-total">
          {listData?.data.meta.totalCount ?? -1}
        </span>
        <span data-testid="first-title">
          {listData?.data.data[0]?.title ?? "none"}
        </span>
        <span data-testid="unread">{unreadData?.data.count ?? -1}</span>
      </div>
    );
  }

  const view = render(
    <QueryClientProvider client={client}>
      <NotificationRealtimeProvider>
        <Consumer />
      </NotificationRealtimeProvider>
    </QueryClientProvider>
  );

  return { client, view };
}

describe("NotificationRealtimeProvider", () => {
  beforeEach(() => {
    FakeWebSocket.reset();
    vi.stubGlobal("WebSocket", FakeWebSocket);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("connects to the notification socket on mount", async () => {
    setup();

    await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));

    expect(FakeWebSocket.last.url).toMatch(/\/api\/notifications\/ws$/);
    expect(FakeWebSocket.last.url).toMatch(/^wss?:\/\//);
  });

  it("asks for the unread count once the socket opens", async () => {
    setup();

    await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));

    act(() => FakeWebSocket.last.open());

    expect(FakeWebSocket.last.sent).toContainEqual(
      JSON.stringify({ type: "unread_count" })
    );
  });

  it("renders live unread counts and created notifications from the socket", async () => {
    const { client } = setup();

    await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));

    act(() => {
      const socket = FakeWebSocket.last;
      socket.open();
      socket.serverSend({
        type: "connected",
        recipientId: "user-1",
        unreadCount: 2,
      });
    });

    await waitFor(() =>
      expect(screen.getByTestId("unread")).toHaveTextContent("2")
    );

    // Seed a fetched page, then push a row over the socket.
    act(() => {
      client.setQueryData(listKey, makeListResponse({ items: 1 }));
    });

    act(() => {
      FakeWebSocket.last.serverSend({
        type: "notification.created",
        notification: makeDto({
          id: "00000000-0000-4000-8000-000000000042",
          title: "Live update",
        }),
        unreadCount: 3,
      });
    });

    await waitFor(() =>
      expect(screen.getByTestId("first-title")).toHaveTextContent("Live update")
    );

    expect(screen.getByTestId("list-count")).toHaveTextContent("2");
    expect(screen.getByTestId("list-total")).toHaveTextContent("2");
    expect(screen.getByTestId("unread")).toHaveTextContent("3");

    // The real query options resolve to the same entry the provider wrote.
    expect(
      client.getQueryData<NotificationListResponse>(
        orpcTQClient.notification.list.queryOptions({
          input: DEFAULT_LIST_INPUT,
        }).queryKey
      )?.data.data[0]?.title
    ).toBe("Live update");
  });

  it("applies a read event to the cached page", async () => {
    const { client } = setup();

    await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));

    act(() => FakeWebSocket.last.open());
    act(() => {
      client.setQueryData(listKey, makeListResponse({ items: 2 }));
      client.setQueryData(unreadKey, {
        message: "ok",
        success: true,
        data: { count: 2 },
      });
    });

    const firstId =
      client.getQueryData<NotificationListResponse>(listKey)!.data.data[0]!.id;

    act(() => {
      FakeWebSocket.last.serverSend({
        type: "notification.read",
        notificationIds: [firstId],
        readAt: "2026-03-01T00:00:00.000Z",
        unreadCount: 1,
      });
    });

    await waitFor(() =>
      expect(screen.getByTestId("unread")).toHaveTextContent("1")
    );

    const row =
      client.getQueryData<NotificationListResponse>(listKey)!.data.data[0]!;

    expect(row.isRead).toBe(true);
    expect(row.readAt).toBeInstanceOf(Date);
  });

  it("ignores malformed frames instead of throwing", async () => {
    const { client } = setup();

    await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));

    act(() => {
      const socket = FakeWebSocket.last;
      socket.open();
      socket.serverSendRaw("not json");
      socket.serverSendRaw({ type: "unknown.frame" });
      socket.serverSendRaw(JSON.stringify({ type: "notification.created" }));
    });

    expect(client.getQueryData(listKey)).toBeUndefined();
  });

  it("closes the socket on unmount and stops reconnecting", async () => {
    const { view } = setup();

    await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));

    act(() => FakeWebSocket.last.open());

    view.unmount();

    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(FakeWebSocket.last.readyState).toBe(FakeWebSocket.CLOSED);
  });
});
