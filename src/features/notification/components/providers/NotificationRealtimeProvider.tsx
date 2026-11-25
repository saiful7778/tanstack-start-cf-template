import { createContext, use, useEffect, useMemo, useState } from "react";

import { orpcTQClient } from "#/oRPC/orpc";
import { useQueryClient } from "@tanstack/react-query";

import {
  applyNotificationServerMessage,
  type NotificationRealtimeKeys,
} from "../../realtime/notification.realtime";
import type { NotificationRealtimeStatus } from "../../realtime/notification.socket";

/** Endpoint served by `src/routes/api/notifications/ws.ts`. */
const NOTIFICATION_SOCKET_PATH = "/api/notifications/ws";

interface NotificationRealtimeContextValue {
  status: NotificationRealtimeStatus;
}

const NotificationRealtimeContext =
  createContext<NotificationRealtimeContextValue | null>(null);

/**
 * Query keys the live feed writes into.
 *
 * `list` is the path prefix only, so every cached page and filter combination
 * is matched; `unreadCount` is exact.
 */
function useRealtimeKeys(): NotificationRealtimeKeys {
  return useMemo(
    () => ({
      list: [orpcTQClient.notification.list.queryKey({ input: {} })[0]],
      unreadCount: orpcTQClient.notification.unreadCount.queryKey(),
    }),
    []
  );
}

/**
 * Keeps the TanStack Query cache in sync with the notification WebSocket.
 *
 * Live events are written straight into the same cache entries the REST
 * endpoints populate, so lists, the unread badge and the panel update without
 * a refetch. The connection is opened once per dashboard mount and torn down
 * on unmount; it never runs during SSR.
 */
export function NotificationRealtimeProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const queryClient = useQueryClient();
  const keys = useRealtimeKeys();
  const [status, setStatus] = useState<NotificationRealtimeStatus>("idle");

  useEffect(() => {
    if (typeof window === "undefined" || !("WebSocket" in window)) return;

    // Imported lazily so the transport never reaches the server bundle.
    const state = {
      cancelled: false,
      disconnect: undefined as (() => void) | undefined,
    };

    void (async () => {
      try {
        const { createNotificationRealtimeClient } =
          await import("../../realtime/notification.socket");

        if (state.cancelled) return;

        const client = createNotificationRealtimeClient({
          url: NOTIFICATION_SOCKET_PATH,
          onStatusChange: setStatus,
          onMessage: (message) =>
            applyNotificationServerMessage(queryClient, message, keys),
        });

        state.disconnect = () => client.disconnect();
        client.connect();
      } catch (error) {
        console.error("Failed to start the notification socket:", error);
      }
    })();

    return () => {
      state.cancelled = true;
      state.disconnect?.();
    };
  }, [queryClient, keys]);

  return (
    <NotificationRealtimeContext value={{ status }}>
      {children}
    </NotificationRealtimeContext>
  );
}

/** Connection status, for a "live" indicator or debugging. */
export function useNotificationRealtime(): NotificationRealtimeContextValue {
  const context = use(NotificationRealtimeContext);

  if (!context) {
    throw new Error("NotificationRealtimeProvider is not found");
  }

  return context;
}
