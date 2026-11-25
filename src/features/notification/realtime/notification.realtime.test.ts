import { DEFAULT_PAGE_SIZE } from "#/constants";
import { orpcTQClient } from "#/oRPC/orpc";
import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import {
  DEFAULT_LIST_INPUT,
  makeDto,
  makeListResponse,
} from "../notification.test-utils";
import {
  applyNotificationServerMessage,
  type NotificationListResponse,
  type NotificationRealtimeKeys,
} from "./notification.realtime";

// `orpc` imports the server router, which pulls in worker-mailer; it needs
// `cloudflare:sockets`, which does not exist outside workerd. `vi.mock` is
// hoisted above the imports, so declaring it here still applies.
vi.mock("worker-mailer", () => ({
  WorkerMailer: { connect: vi.fn() },
}));

/**
 * Real oRPC query keys, so the assertions cover the actual cache entries the
 * list and badge components subscribe to — not a hand-made lookalike.
 */
const KEYS: NotificationRealtimeKeys = {
  list: [orpcTQClient.notification.list.queryKey({ input: {} })[0]],
  unreadCount: orpcTQClient.notification.unreadCount.queryKey(),
};

function listKey(
  input: Parameters<typeof orpcTQClient.notification.list.queryKey>[0]["input"]
) {
  return orpcTQClient.notification.list.queryKey({ input });
}

function unreadCountKey() {
  return orpcTQClient.notification.unreadCount.queryKey();
}

function createClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
}

/** Seed the cache the way a resolved `useQuery` would. */
function seedList(
  client: QueryClient,
  input: Parameters<typeof listKey>[0],
  response: NotificationListResponse
) {
  client.setQueryData(listKey(input), response);
}

function readList(
  client: QueryClient,
  input: Parameters<typeof listKey>[0]
): NotificationListResponse {
  return client.getQueryData<NotificationListResponse>(listKey(input))!;
}

function seedUnread(client: QueryClient, count: number) {
  client.setQueryData(unreadCountKey(), {
    message: "ok",
    success: true,
    data: { count },
  });
}

function readUnread(client: QueryClient): number | undefined {
  return client.getQueryData<{ data: { count: number } }>(unreadCountKey())
    ?.data.count;
}

describe("notification realtime cache sync", () => {
  describe("connected", () => {
    it("seeds the unread badge from the handshake", () => {
      const client = createClient();

      applyNotificationServerMessage(
        client,
        { type: "connected", recipientId: "user-1", unreadCount: 7 },
        KEYS
      );

      expect(readUnread(client)).toBe(7);
    });

    it("creates the entry when nothing has been fetched yet", () => {
      const client = createClient();

      applyNotificationServerMessage(
        client,
        { type: "notification.unread_count", count: 3 },
        KEYS
      );

      expect(client.getQueryData(unreadCountKey())).toMatchObject({
        success: true,
        data: { count: 3 },
      });
    });
  });

  describe("notification.created", () => {
    it("prepends the row to the first page and bumps the badge", () => {
      const client = createClient();
      seedList(client, DEFAULT_LIST_INPUT, makeListResponse({ items: 2 }));
      seedUnread(client, 2);

      applyNotificationServerMessage(
        client,
        {
          type: "notification.created",
          notification: makeDto({ id: "new-id", title: "Fresh" }),
          unreadCount: 3,
        },
        KEYS
      );

      const list = readList(client, DEFAULT_LIST_INPUT);

      expect(list.data.data[0]).toMatchObject({
        id: "new-id",
        title: "Fresh",
        isRead: false,
      });
      expect(list.data.data).toHaveLength(3);
      expect(list.data.meta.totalCount).toBe(3);
      expect(readUnread(client)).toBe(3);
    });

    it("inserts a row whose dates are Date instances, matching the REST shape", () => {
      const client = createClient();
      seedList(client, DEFAULT_LIST_INPUT, makeListResponse({ items: 0 }));

      applyNotificationServerMessage(
        client,
        {
          type: "notification.created",
          notification: makeDto({ createdAt: "2026-02-03T04:05:06.000Z" }),
          unreadCount: 1,
        },
        KEYS
      );

      const row = readList(client, DEFAULT_LIST_INPUT).data.data[0]!;

      expect(row.createdAt).toBeInstanceOf(Date);
      expect(row.createdAt.toISOString()).toBe("2026-02-03T04:05:06.000Z");
      expect(row.readAt).toBeNull();
    });

    it("caps the page at its limit and drops the oldest row", () => {
      const client = createClient();
      const input = { page: 1, limit: 2 };
      seedList(client, input, makeListResponse({ items: 2, limit: 2 }));

      applyNotificationServerMessage(
        client,
        {
          type: "notification.created",
          notification: makeDto({ id: "newest" }),
          unreadCount: 3,
        },
        KEYS
      );

      const list = readList(client, input);

      expect(list.data.data).toHaveLength(2);
      expect(list.data.data.map((row) => row.id)).toEqual([
        "newest",
        "00000000-0000-4000-8000-000000000000",
      ]);
      expect(list.data.meta.totalCount).toBe(3);
    });

    it("updates every cached page/filter combination it can place", () => {
      const client = createClient();
      const all = { page: 1, limit: 20 };
      const systemOnly = { page: 1, limit: 20, filter: { category: "SYSTEM" } };
      seedList(client, all, makeListResponse({ items: 1 }));
      seedList(client, systemOnly, makeListResponse({ items: 1 }));

      applyNotificationServerMessage(
        client,
        {
          type: "notification.created",
          notification: makeDto({ id: "sys", category: "SYSTEM" }),
          unreadCount: 1,
        },
        KEYS
      );

      expect(readList(client, all).data.data).toHaveLength(2);
      expect(readList(client, systemOnly).data.data).toHaveLength(2);
    });

    it("leaves a query alone when the row fails its filter", () => {
      const client = createClient();
      const authOnly = { page: 1, limit: 20, filter: { category: "AUTH" } };
      const seeded = makeListResponse({ items: 1 });
      seedList(client, authOnly, seeded);

      const invalidate = vi.spyOn(client, "invalidateQueries");

      applyNotificationServerMessage(
        client,
        {
          type: "notification.created",
          notification: makeDto({ category: "SYSTEM" }),
          unreadCount: 1,
        },
        KEYS
      );

      // Same object: untouched, and no refetch either.
      expect(readList(client, authOnly)).toBe(seeded);
      expect(invalidate).not.toHaveBeenCalled();
    });

    it("refetches instead of guessing for a later page", () => {
      const client = createClient();
      const page2 = { page: 2, limit: DEFAULT_PAGE_SIZE };
      seedList(client, page2, makeListResponse({ items: 20, page: 2 }));

      const invalidate = vi.spyOn(client, "invalidateQueries");

      applyNotificationServerMessage(
        client,
        {
          type: "notification.created",
          notification: makeDto({ id: "new" }),
          unreadCount: 21,
        },
        KEYS
      );

      expect(invalidate).toHaveBeenCalledWith(
        expect.objectContaining({ exact: true })
      );
    });

    it("refetches an active search rather than reimplementing matching", () => {
      const client = createClient();
      const searched = { page: 1, limit: 20, search: "invoice" };
      seedList(client, searched, makeListResponse({ items: 1 }));

      const invalidate = vi.spyOn(client, "invalidateQueries");

      applyNotificationServerMessage(
        client,
        {
          type: "notification.created",
          notification: makeDto({ title: "Totally unrelated" }),
          unreadCount: 1,
        },
        KEYS
      );

      expect(invalidate).toHaveBeenCalled();
    });

    it("does nothing when no page has been cached", () => {
      const client = createClient();
      const invalidate = vi.spyOn(client, "invalidateQueries");

      applyNotificationServerMessage(
        client,
        {
          type: "notification.created",
          notification: makeDto(),
          unreadCount: 1,
        },
        KEYS
      );

      expect(invalidate).not.toHaveBeenCalled();
      expect(readUnread(client)).toBe(1);
    });
  });

  describe("notification.read", () => {
    it("marks the rows read in place without refetching", () => {
      const client = createClient();
      const input = { page: 1, limit: 20 };
      seedList(client, input, makeListResponse({ items: 3 }));
      seedUnread(client, 3);

      const invalidate = vi.spyOn(client, "invalidateQueries");
      const first = readList(client, input).data.data[0]!;

      applyNotificationServerMessage(
        client,
        {
          type: "notification.read",
          notificationIds: [first.id],
          readAt: "2026-03-01T00:00:00.000Z",
          unreadCount: 2,
        },
        KEYS
      );

      const list = readList(client, input);

      expect(list.data.data[0]).toMatchObject({ id: first.id, isRead: true });
      expect(list.data.data[0]!.readAt?.toISOString()).toBe(
        "2026-03-01T00:00:00.000Z"
      );
      expect(list.data.data[1]!.isRead).toBe(false);
      expect(readUnread(client)).toBe(2);
      expect(invalidate).not.toHaveBeenCalled();
    });

    it("removes rows from a query filtered to unread", () => {
      const client = createClient();
      const input = { page: 1, limit: 20, filter: { isRead: false } };
      seedList(client, input, makeListResponse({ items: 2 }));

      const [a, b] = readList(client, input).data.data;

      applyNotificationServerMessage(
        client,
        {
          type: "notification.read",
          notificationIds: [a!.id],
          readAt: "2026-03-01T00:00:00.000Z",
          unreadCount: 1,
        },
        KEYS
      );

      const list = readList(client, input);

      expect(list.data.data.map((row) => row.id)).toEqual([b!.id]);
      expect(list.data.meta.totalCount).toBe(1);
    });

    it("ignores ids that are not on the page", () => {
      const client = createClient();
      const input = { page: 1, limit: 20 };
      const seeded = makeListResponse({ items: 1 });
      seedList(client, input, seeded);

      applyNotificationServerMessage(
        client,
        {
          type: "notification.read",
          notificationIds: ["not-on-this-page"],
          readAt: "2026-03-01T00:00:00.000Z",
          unreadCount: 0,
        },
        KEYS
      );

      // Rows untouched; only the badge (authoritative) moves.
      expect(readList(client, input).data.data).toEqual(seeded.data.data);
      expect(readUnread(client)).toBe(0);
    });
  });

  describe("notification.read_all", () => {
    it("marks every cached row read and zeroes the badge", () => {
      const client = createClient();
      const input = { page: 1, limit: 20 };
      seedList(client, input, makeListResponse({ items: 3 }));
      seedUnread(client, 3);

      applyNotificationServerMessage(
        client,
        {
          type: "notification.read_all",
          readAt: "2026-03-01T00:00:00.000Z",
          unreadCount: 0,
        },
        KEYS
      );

      const list = readList(client, input);

      expect(list.data.data.every((row) => row.isRead)).toBe(true);
      expect(list.data.meta.totalCount).toBe(3);
      expect(readUnread(client)).toBe(0);
    });

    it("empties an unread-only query", () => {
      const client = createClient();
      const input = { page: 1, limit: 20, filter: { isRead: false } };
      seedList(client, input, makeListResponse({ items: 2 }));

      applyNotificationServerMessage(
        client,
        {
          type: "notification.read_all",
          readAt: "2026-03-01T00:00:00.000Z",
          unreadCount: 0,
        },
        KEYS
      );

      expect(readList(client, input).data.data).toEqual([]);
      expect(readList(client, input).data.meta.totalCount).toBe(0);
    });
  });

  it("ignores pong and error frames", () => {
    const client = createClient();
    seedUnread(client, 5);

    applyNotificationServerMessage(
      client,
      { type: "pong", timestamp: 1 },
      KEYS
    );
    applyNotificationServerMessage(
      client,
      { type: "error", message: "nope" },
      KEYS
    );

    expect(readUnread(client)).toBe(5);
  });
});
