import { useCallback, useEffect, useRef } from "react";

import { QueryStateBoundary } from "#/components/tanstack-query/query-state-boundary";
import { Button } from "#/components/ui/button";
import { PopoverContent } from "#/components/ui/popover";
import { ScrollArea } from "#/components/ui/scroll-area";
import { Separator } from "#/components/ui/separator";
import { Skeleton } from "#/components/ui/skeleton";
import { DEFAULT_PAGE_INDEX, DEFAULT_PAGE_SIZE } from "#/constants";
import { useIntersectionObserver } from "#/hooks/use-intersection-observer";
import { orpcTQClient } from "#/oRPC/orpc";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { cn } from "cn";
import { Bell, BellOff, CheckCheck, RotateCw } from "lucide-react";

import {
  useNotificationMarkAllAsRead,
  useNotificationMarkAsRead,
  useUnreadNotificationCount,
} from "../api/notification.api.hook";
import { NotificationItem } from "./NotificationItem";
import { useNotificationRealtime } from "./providers/NotificationRealtimeProvider";

/**
 * Rows must be visible for this long before being marked read.
 *
 * Without it, a notification that merely flies past during a scroll gesture
 * would be marked read before the user could register it.
 */
const SEEN_DELAY_MS = 1_200;

/** Initial visible fraction that counts as "the user is looking at this row". */
const SEEN_THRESHOLD = 0.6;

/** Collapse a burst of observer callbacks into one mark-as-read request. */
const MARK_READ_DEBOUNCE_MS = 250;

/**
 * Shows whether the live feed is connected.
 *
 * Notifications still arrive on navigation via the REST endpoints, so this is
 * informational rather than an error state.
 */
function LiveIndicator() {
  const { status } = useNotificationRealtime();

  const isLive = status === "open";

  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] text-muted-foreground"
      title={isLive ? "Connected for live updates" : "Reconnecting…"}
    >
      <span
        className={cn(
          "size-1.5 rounded-full",
          isLive ? "bg-emerald-500" : "bg-muted-foreground/50"
        )}
        aria-hidden
      />
      <span className="sr-only">
        {isLive ? "Live updates connected" : "Live updates disconnected"}
      </span>
    </span>
  );
}

/** Loading placeholder sized for the popover, not the full-page default. */
function PanelSkeleton() {
  return (
    <div className="divide-y divide-border">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="flex gap-3 p-3">
          <Skeleton className="size-8 shrink-0 rounded-lg" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-1/3" />
            <Skeleton className="h-3 w-2/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

function PanelEmpty() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-muted-foreground">
      <BellOff className="size-6" />
      <p className="text-xs">You have no notifications yet.</p>
    </div>
  );
}

/**
 * Compact failure state.
 *
 * The shared default is a full-page error with a stack-ish details block, which
 * would blow out a 400px popover.
 */
function PanelError({ error, onRetry }: { error: Error; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center">
      <BellOff className="size-6 text-destructive" />
      <p className="text-xs font-medium text-foreground">
        Could not load notifications
      </p>
      <p className="line-clamp-2 text-[11px] text-muted-foreground">
        {error.message}
      </p>
      <Button size="xs" variant="outline" onClick={onRetry}>
        <RotateCw />
        <span>Try again</span>
      </Button>
    </div>
  );
}

/**
 * The popover's contents: header, list and footer.
 *
 * Kept separate from {@link NotificationPanel} so the trigger stays a pure
 * badge and the list query lives next to the UI that consumes it. The query is
 * gated on `enabled`, so nothing is fetched while the panel is closed.
 */
export function NotificationPanelContent({ enabled }: { enabled: boolean }) {
  const { data: unread } = useUnreadNotificationCount();
  const unreadCount = unread?.data.count ?? 0;

  const { data, isLoading, isError, error, refetch } = useQuery({
    ...orpcTQClient.notification.list.queryOptions({
      input: {
        page: DEFAULT_PAGE_INDEX,
        limit: DEFAULT_PAGE_SIZE,
      },
    }),
    enabled,
  });

  const { mutate: markAllAsRead, isPending: isMarkingAll } =
    useNotificationMarkAllAsRead();
  const { markAsRead, isPending: isMarking } = useNotificationMarkAsRead();

  /**
   * Ids that became visible while the panel was open.
   *
   * Collected here and flushed once per debounce window so a single scroll
   * gesture that reveals several rows produces one request, not one per row.
   */
  const pendingIdsRef = useRef(new Set<string>());
  const flushTimerRef = useRef<number | undefined>(undefined);

  const flushPending = useCallback(() => {
    if (flushTimerRef.current !== undefined) {
      window.clearTimeout(flushTimerRef.current);
      flushTimerRef.current = undefined;
    }

    const ids = [...pendingIdsRef.current];

    pendingIdsRef.current.clear();

    if (ids.length > 0) markAsRead({ ids });
  }, [markAsRead]);

  const handleSeen = useCallback(
    (id: string) => {
      pendingIdsRef.current.add(id);

      if (flushTimerRef.current === undefined) {
        flushTimerRef.current = window.setTimeout(
          flushPending,
          MARK_READ_DEBOUNCE_MS
        );
      }
    },
    [flushPending]
  );

  // Flush on unmount: closing the panel is the user saying "I've looked".
  useEffect(
    () => () => {
      if (flushTimerRef.current !== undefined) flushPending();
    },
    [flushPending]
  );

  return (
    <PopoverContent align="end" side="bottom" className="w-100 gap-0 p-0">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex items-center gap-2">
          <Bell className="size-4" />
          <span className="text-sm font-semibold tracking-tight select-none">
            Notifications
          </span>
          {unreadCount > 0 && (
            <span className="inline-flex size-4 items-center justify-center rounded-full bg-secondary px-1.5 text-[10px] font-bold text-secondary-foreground">
              {unreadCount}
            </span>
          )}
          <LiveIndicator />
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => markAllAsRead()}
          disabled={isMarkingAll || unreadCount === 0}
        >
          <CheckCheck />
          <span>Mark all read</span>
        </Button>
      </div>

      <Separator />

      {/* Notification List */}
      <ScrollArea className="h-100">
        <QueryStateBoundary
          isLoading={isLoading}
          isError={isError}
          error={error}
          data={data?.data}
          isEmpty={(page) => page.data.length === 0}
          loadingFallback={<PanelSkeleton />}
          emptyFallback={<PanelEmpty />}
          errorFallback={(err) => (
            <PanelError error={err} onRetry={() => void refetch()} />
          )}
        >
          {({ data: notifications }) => (
            <div className="divide-y divide-border">
              {notifications.map((notification) => (
                <SeenNotificationItem
                  key={notification.id}
                  notification={notification}
                  enabled={enabled}
                  onSeen={handleSeen}
                  isMarkingAsRead={isMarking}
                />
              ))}
            </div>
          )}
        </QueryStateBoundary>
      </ScrollArea>

      <div className="flex items-center justify-center border-t p-1">
        <Button
          className="w-full cursor-pointer"
          variant="ghost"
          nativeButton={false}
          render={<Link to="/dashboard/notifications" />}
        >
          Read All Notifications
        </Button>
      </div>
    </PopoverContent>
  );
}

/**
 * One notification row that marks itself read once the user has actually seen
 * it: visible past `SEEN_THRESHOLD` for `SEEN_DELAY_MS`, in a rendered panel.
 */
function SeenNotificationItem({
  notification,
  enabled,
  onSeen,
  isMarkingAsRead,
}: {
  notification: Parameters<typeof NotificationItem>[0]["notification"];
  enabled: boolean;
  onSeen: (id: string) => void;
  isMarkingAsRead: boolean;
}) {
  const seenTimerRef = useRef<number | undefined>(undefined);

  const shouldWatch = enabled && !notification.isRead;

  const { ref, isIntersecting } = useIntersectionObserver<HTMLDivElement>({
    threshold: SEEN_THRESHOLD,
    // Once seen, there is nothing left to observe for this row.
    once: true,
    enabled: shouldWatch,
  });

  useEffect(() => {
    if (!shouldWatch || !isIntersecting) return;

    seenTimerRef.current = window.setTimeout(
      () => onSeen(notification.id),
      SEEN_DELAY_MS
    );

    return () => window.clearTimeout(seenTimerRef.current);
  }, [isIntersecting, notification.id, onSeen, shouldWatch]);

  return (
    <div ref={ref}>
      <NotificationItem
        notification={notification}
        isMarkingAsRead={shouldWatch ? isMarkingAsRead : undefined}
        onMarkAsRead={onSeen}
      />
    </div>
  );
}
