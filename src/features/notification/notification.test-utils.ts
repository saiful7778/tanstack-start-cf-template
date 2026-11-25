import { DEFAULT_PAGE_INDEX, DEFAULT_PAGE_SIZE } from "#/constants";
import { buildPaginationMeta } from "#/db/utils/paginate-query/buildPaginationMeta";

import type { NotificationDto } from "./notification.types";
import type { NotificationListResponse } from "./realtime/notification.realtime";

export const USER_ID = "11111111-1111-4111-8111-111111111111";

export function makeDto(
  overrides: Partial<NotificationDto> = {}
): NotificationDto {
  const now = new Date("2026-01-01T00:00:00.000Z").toISOString();

  return {
    id: "00000000-0000-4000-8000-000000000001",
    recipientId: USER_ID,
    actorId: null,
    category: "SYSTEM",
    level: "INFO",
    title: "A notification",
    message: "Something happened",
    data: null,
    isRead: false,
    readAt: null,
    isArchived: false,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

export function makeListResponse({
  items,
  page = 1,
  limit = 20,
}: {
  items: number;
  page?: number;
  limit?: number;
}): NotificationListResponse {
  const data = Array.from({ length: items }).map((_, index) => ({
    id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    category: "SYSTEM" as const,
    level: "INFO" as const,
    title: `Notification ${index}`,
    message: `Message ${index}`,
    data: null,
    isRead: false,
    readAt: null,
    createdAt: new Date(`2026-01-01T00:00:0${index % 10}.000Z`),
    updatedAt: new Date(`2026-01-01T00:00:0${index % 10}.000Z`),
  }));

  return {
    message: "ok",
    success: true,
    data: {
      meta: buildPaginationMeta(items, data.length, page, limit),
      data,
    },
  };
}

export const DEFAULT_LIST_INPUT = {
  page: DEFAULT_PAGE_INDEX,
  limit: DEFAULT_PAGE_SIZE,
};

/**
 * A WebSocket stand-in that records sends and lets a test drive the events a
 * real socket would emit.
 */
export class FakeWebSocket extends EventTarget {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instances: Array<FakeWebSocket> = [];

  readonly url: string;
  readyState: number = FakeWebSocket.CONNECTING;
  sent: string[] = [];

  constructor(url: string) {
    super();
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.readyState = FakeWebSocket.CLOSED;
    this.dispatchEvent(new Event("close"));
  }

  // Test helpers
  open() {
    this.readyState = FakeWebSocket.OPEN;
    this.dispatchEvent(new Event("open"));
  }

  serverSend(message: unknown) {
    this.dispatchEvent(
      new MessageEvent("message", { data: JSON.stringify(message) })
    );
  }

  serverSendRaw(data: unknown) {
    this.dispatchEvent(new MessageEvent("message", { data }));
  }

  serverClose() {
    this.readyState = FakeWebSocket.CLOSED;
    this.dispatchEvent(new Event("close"));
  }

  static reset() {
    FakeWebSocket.instances = [];
  }

  static get last(): FakeWebSocket {
    const instance = FakeWebSocket.instances.at(-1);

    if (!instance) throw new Error("No FakeWebSocket was created");

    return instance;
  }
}
