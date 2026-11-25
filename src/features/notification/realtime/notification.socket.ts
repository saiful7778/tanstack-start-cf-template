import {
  notificationClientMessageSchema,
  notificationEventSchema,
  type NotificationServerMessage,
} from "../notification.types";

/** How long a connection may stay down before the client gives up. */
const MAX_RECONNECT_ATTEMPTS = 8;

/** Backoff schedule in milliseconds: 1s, 2s, 4s … capped at 30s. */
const BASE_RECONNECT_DELAY_MS = 1_000;
const MAX_RECONNECT_DELAY_MS = 30_000;

/**
 * Ping interval.
 *
 * Cloudflare drops idle WebSockets, so a periodic client message keeps the
 * connection alive and lets a dead socket be detected between events.
 */
const HEARTBEAT_INTERVAL_MS = 25_000;

export type NotificationRealtimeStatus =
  "idle" | "connecting" | "open" | "reconnecting" | "closed";

export interface NotificationRealtimeClientOptions {
  /** Absolute or relative WebSocket URL, e.g. `/api/notifications/ws`. */
  url: string;
  /** Called for every decoded server message. */
  onMessage: (message: NotificationServerMessage) => void;
  /** Called whenever the connection status changes. */
  onStatusChange?: (status: NotificationRealtimeStatus) => void;
  onError?: (error: Event) => void;
  /** Injected for tests. */
  createWebSocket?: (url: string) => WebSocket;
}

export interface NotificationRealtimeClient {
  connect: () => void;
  disconnect: () => void;
  status: () => NotificationRealtimeStatus;
}

function resolveWebSocketUrl(url: string): string {
  if (url.startsWith("ws://") || url.startsWith("wss://")) return url;

  const { protocol, host } = window.location;

  return `${protocol === "https:" ? "wss" : "ws"}://${host}${url}`;
}

function reconnectDelay(attempt: number): number {
  return Math.min(
    BASE_RECONNECT_DELAY_MS * 2 ** Math.max(0, attempt - 1),
    MAX_RECONNECT_DELAY_MS
  );
}

/**
 * Decode one frame from the durable object.
 *
 * Frames are `NotificationServerMessage`s; anything unrecognised is ignored so
 * a newer server cannot crash an older client.
 */
export function parseServerMessage(
  data: unknown
): NotificationServerMessage | null {
  if (typeof data !== "string") return null;

  let payload: unknown;

  try {
    payload = JSON.parse(data);
  } catch {
    return null;
  }

  if (!payload || typeof payload !== "object" || !("type" in payload)) {
    return null;
  }

  const { type } = payload;

  switch (type) {
    case "connected":
    case "pong":
    case "error":
      return payload as NotificationServerMessage;
    default:
      break;
  }

  // Live events share one schema; `unread_count` is a plain event too.
  const event = notificationEventSchema.safeParse(payload);

  return event.success ? event.data : null;
}

/**
 * Open and keep open a notification socket.
 *
 * The client is framework-agnostic: it owns the connection, heartbeat and
 * reconnect loop, and hands decoded messages to the caller. Keeping the
 * transport here means the React layer never touches WebSocket lifetimes.
 */
export function createNotificationRealtimeClient(
  options: NotificationRealtimeClientOptions
): NotificationRealtimeClient {
  const createWebSocket =
    options.createWebSocket ?? ((url: string) => new WebSocket(url));

  let socket: WebSocket | null = null;
  let currentStatus: NotificationRealtimeStatus = "idle";
  let attempts = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let heartbeatTimer: ReturnType<typeof setInterval> | undefined;
  let disposed = false;

  function setStatus(status: NotificationRealtimeStatus): void {
    if (currentStatus === status) return;

    currentStatus = status;
    options.onStatusChange?.(status);
  }

  function stopHeartbeat(): void {
    if (heartbeatTimer === undefined) return;

    clearInterval(heartbeatTimer);
    heartbeatTimer = undefined;
  }

  function send(message: unknown): void {
    if (socket?.readyState !== WebSocket.OPEN) return;

    const parsed = notificationClientMessageSchema.safeParse(message);

    if (!parsed.success) return;

    socket.send(JSON.stringify(parsed.data));
  }

  function startHeartbeat(): void {
    stopHeartbeat();

    heartbeatTimer = setInterval(() => {
      send({ type: "ping" });
    }, HEARTBEAT_INTERVAL_MS);
  }

  function scheduleReconnect(): void {
    if (disposed) return;

    attempts += 1;

    if (attempts > MAX_RECONNECT_ATTEMPTS) {
      setStatus("closed");
      return;
    }

    setStatus("reconnecting");

    reconnectTimer = setTimeout(() => {
      open();
    }, reconnectDelay(attempts));
  }

  function open(): void {
    if (disposed) return;

    setStatus(attempts > 0 ? "reconnecting" : "connecting");

    let next: WebSocket;

    try {
      next = createWebSocket(resolveWebSocketUrl(options.url));
    } catch (error) {
      options.onError?.(error as Event);
      scheduleReconnect();
      return;
    }

    socket = next;

    next.addEventListener("open", () => {
      attempts = 0;
      setStatus("open");
      // Ask for the authoritative count on every (re)connect: events can be
      // missed while the connection is down.
      send({ type: "unread_count" });
      startHeartbeat();
    });

    next.addEventListener("message", (event: MessageEvent<unknown>) => {
      const message = parseServerMessage(event.data);

      if (message) options.onMessage(message);
    });

    next.addEventListener("error", (event) => {
      options.onError?.(event);
    });

    next.addEventListener("close", () => {
      stopHeartbeat();

      if (socket === next) socket = null;

      scheduleReconnect();
    });
  }

  function clearTimers(): void {
    if (reconnectTimer !== undefined) {
      clearTimeout(reconnectTimer);
      reconnectTimer = undefined;
    }

    stopHeartbeat();
  }

  return {
    connect() {
      if (disposed) return;
      if (socket) return;

      attempts = 0;
      clearTimers();
      open();
    },

    disconnect() {
      disposed = true;
      clearTimers();
      setStatus("closed");

      if (!socket) return;

      const current = socket;
      socket = null;
      current.close(1000, "Client disconnect");
    },

    status() {
      return currentStatus;
    },
  };
}
