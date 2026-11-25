import { DEFAULT_PAGE_INDEX, DEFAULT_PAGE_SIZE } from "#/constants";
import { API_MESSAGES } from "#/constants/apiMessage";
import { buildPaginationMeta } from "#/db/utils/paginate-query/buildPaginationMeta";
import { apiResponse } from "#/utils/apiResponse";
import type { QueryClient, QueryKey } from "@tanstack/react-query";

import type { ListNotificationContractType } from "../api/notification.contract";
import type {
  NotificationDto,
  NotificationServerMessage,
} from "../notification.types";

/** A row as the list endpoint returns it (dates are decoded `Date`s). */
export type NotificationListItem =
  ListNotificationContractType["output"]["data"]["data"][number];

/** The list query input, as stored in the query key. */
export type NotificationListInput = ListNotificationContractType["input"];

/** The full API envelope cached by the list query. */
export type NotificationListResponse = ListNotificationContractType["output"];

/** Query keys the realtime layer writes to. */
export interface NotificationRealtimeKeys {
  /** Path-only key such as `[["notification", "list"]]`, used as a prefix. */
  list: QueryKey;
  unreadCount: QueryKey;
}

type UnreadCountResponse = {
  message: string;
  success: boolean;
  data: { count: number };
};

/**
 * Outcome of applying an event to one cached list page.
 *
 * - `updated` — the cache now reflects the event, no request needed.
 * - `ignore` — the event cannot affect this query (wrong filter, other page).
 * - `refetch` — the row might belong here but cannot be placed confidently.
 */
export type ListUpdate =
  | { status: "updated"; response: NotificationListResponse }
  | { status: "ignore" }
  | { status: "refetch" };

const IGNORE: ListUpdate = { status: "ignore" };
const REFETCH: ListUpdate = { status: "refetch" };

function toDate(value: string | Date | null | undefined): Date | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value;

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Convert a pushed DTO (ISO strings, owner fields) into the row shape the list
 * query caches, so an inserted row is indistinguishable from a fetched one.
 */
export function toNotificationListItem(
  notification: NotificationDto
): NotificationListItem {
  return {
    id: notification.id,
    category: notification.category,
    level: notification.level,
    title: notification.title,
    message: notification.message,
    data: notification.data,
    isRead: notification.isRead,
    readAt: toDate(notification.readAt),
    // The list schema decodes these into `Date`s, so live rows must match or
    // the cache would hold two shapes and re-render resets.
    createdAt: toDate(notification.createdAt) ?? new Date(),
    updatedAt: toDate(notification.updatedAt) ?? new Date(),
  };
}

/**
 * Whether a notification belongs in a list query's result set.
 *
 * The list endpoint always hides archived rows, so a filter asking for archived
 * notifications matches nothing.
 */
export function matchesListFilters(
  input: NotificationListInput,
  item: Pick<NotificationListItem, "category" | "level" | "isRead">
): boolean {
  const filter = input.filter;

  if (filter?.category && filter.category !== item.category) return false;
  if (filter?.level && filter.level !== item.level) return false;
  if (filter?.isRead === true && !item.isRead) return false;
  if (filter?.isRead === false && item.isRead) return false;
  if (filter?.isArchived === true) return false;

  return true;
}

function readPage(input: NotificationListInput): number {
  return input.page ?? DEFAULT_PAGE_INDEX;
}

function readLimit(input: NotificationListInput): number {
  return input.limit ?? DEFAULT_PAGE_SIZE;
}

function withPage(
  response: NotificationListResponse,
  input: NotificationListInput,
  data: NotificationListItem[],
  totalCount: number
): NotificationListResponse {
  return {
    ...response,
    data: {
      meta: buildPaginationMeta(
        Math.max(0, totalCount),
        data.length,
        readPage(input),
        readLimit(input)
      ),
      data,
    },
  };
}

/**
 * Insert a new notification at the top of the first page.
 *
 * Only the first page of an unfiltered-by-search query can be placed without
 * asking the server where the row belongs. Anything else is `refetch` — a
 * wrong optimistic row is worse than one extra request.
 */
export function insertNotification(
  response: NotificationListResponse,
  input: NotificationListInput,
  item: NotificationListItem
): ListUpdate {
  if (!matchesListFilters(input, item)) return IGNORE;

  // A search hit depends on the server's matching rules (title only, lowercased
  // input), which the client must not reimplement.
  if (input.search) return REFETCH;

  // On a later page the row may have pushed an item onto this page.
  if (readPage(input) !== DEFAULT_PAGE_INDEX) return REFETCH;

  const limit = readLimit(input);
  const nextData = [item, ...response.data.data].slice(0, limit);

  return {
    status: "updated",
    response: withPage(
      response,
      input,
      nextData,
      response.data.meta.totalCount + 1
    ),
  };
}

/**
 * Apply a "marked read" event.
 *
 * A query filtered to unread rows must drop the rows it just marked, otherwise
 * the list keeps showing notifications the badge no longer counts.
 */
export function markNotificationsRead(
  response: NotificationListResponse,
  input: NotificationListInput,
  notificationIds: string[],
  readAt: string
): ListUpdate {
  const ids = new Set(notificationIds);
  const hidesReadRows = input.filter?.isRead === false;
  const readAtDate = toDate(readAt) ?? new Date();

  let changed = false;
  let removed = 0;
  const nextData: NotificationListItem[] = [];

  for (const item of response.data.data) {
    if (!ids.has(item.id) || item.isRead) {
      nextData.push(item);
      continue;
    }

    changed = true;

    if (hidesReadRows) {
      removed += 1;
      continue;
    }

    nextData.push({ ...item, isRead: true, readAt: readAtDate });
  }

  if (!changed) return IGNORE;

  return {
    status: "updated",
    response: withPage(
      response,
      input,
      nextData,
      response.data.meta.totalCount - removed
    ),
  };
}

/** Apply a "marked all read" event to a cached page. */
export function markAllNotificationsRead(
  response: NotificationListResponse,
  input: NotificationListInput,
  readAt: string
): ListUpdate {
  const readAtDate = toDate(readAt) ?? new Date();

  if (input.filter?.isRead === false) {
    if (response.data.data.length === 0) return IGNORE;

    return { status: "updated", response: withPage(response, input, [], 0) };
  }

  if (response.data.data.every((item) => item.isRead)) return IGNORE;

  return {
    status: "updated",
    response: withPage(
      response,
      input,
      response.data.data.map((item) =>
        item.isRead ? item : { ...item, isRead: true, readAt: readAtDate }
      ),
      response.data.meta.totalCount
    ),
  };
}

/**
 * Read the input back out of a list query key.
 *
 * Keys are `[["notification", "list"], { input, type }]`, so the second entry
 * carries the request the cached page was fetched with.
 */
export function readListInput(queryKey: QueryKey): NotificationListInput {
  const params = queryKey[1];

  if (params && typeof params === "object" && "input" in params) {
    return params.input ?? {};
  }

  return {};
}

function writeUnreadCount(
  queryClient: QueryClient,
  key: QueryKey,
  count: number
): void {
  queryClient.setQueryData<UnreadCountResponse>(key, (previous) =>
    previous
      ? { ...previous, data: { ...previous.data, count } }
      : apiResponse(API_MESSAGES.NOTIFICATION.GET_UNREAD_COUNT, { count })
  );
}

function updateListQueries(
  queryClient: QueryClient,
  keys: NotificationRealtimeKeys,
  update: (
    response: NotificationListResponse,
    input: NotificationListInput
  ) => ListUpdate
): void {
  for (const query of queryClient.getQueryCache().findAll({
    queryKey: keys.list,
  })) {
    // No cached page yet: the next load fetches fresh data anyway.
    const cached = query.state.data as NotificationListResponse | undefined;

    if (!cached) continue;

    const result = update(cached, readListInput(query.queryKey));

    if (result.status === "updated") {
      queryClient.setQueryData(query.queryKey, result.response);
    } else if (result.status === "refetch") {
      void queryClient.invalidateQueries({
        queryKey: query.queryKey,
        exact: true,
      });
    }
  }
}

/**
 * Write a server message into the TanStack Query cache.
 *
 * Every live event lands on the same cache entries the REST endpoints populate,
 * so mounted lists, the badge and the panel update without a refetch, and a
 * later navigation reads fresh data instead of stale rows.
 */
export function applyNotificationServerMessage(
  queryClient: QueryClient,
  message: NotificationServerMessage,
  keys: NotificationRealtimeKeys
): void {
  switch (message.type) {
    case "connected":
    case "notification.unread_count":
      writeUnreadCount(
        queryClient,
        keys.unreadCount,
        message.type === "connected" ? message.unreadCount : message.count
      );
      return;

    case "notification.created": {
      const item = toNotificationListItem(message.notification);

      updateListQueries(queryClient, keys, (response, input) =>
        insertNotification(response, input, item)
      );
      writeUnreadCount(queryClient, keys.unreadCount, message.unreadCount);
      return;
    }

    case "notification.read": {
      updateListQueries(queryClient, keys, (response, input) =>
        markNotificationsRead(
          response,
          input,
          message.notificationIds,
          message.readAt
        )
      );
      writeUnreadCount(queryClient, keys.unreadCount, message.unreadCount);
      return;
    }

    case "notification.read_all": {
      updateListQueries(queryClient, keys, (response, input) =>
        markAllNotificationsRead(response, input, message.readAt)
      );
      writeUnreadCount(queryClient, keys.unreadCount, message.unreadCount);
      return;
    }

    // `pong`, `error` and anything else carry no cache state.
    default:
      return;
  }
}
