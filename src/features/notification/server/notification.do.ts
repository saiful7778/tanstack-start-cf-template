import { createDrizzleClient } from "#/db/clients/drizzle-client";
import { NotificationTable } from "#/db/schemas";
import { notificationLog } from "#/lib/logger.server";
import { DurableObject } from "cloudflare:workers";
import { and, count, eq } from "drizzle-orm";

import {
  notificationClientMessageSchema,
  notificationEventSchema,
  type NotificationEvent,
  type NotificationServerMessage,
} from "../notification.types";

const WEB_SOCKET_OPEN = 1;

/**
 * One durable object per recipient.
 *
 * D1 remains the source of truth for notification rows. This object only owns
 * the live connections for a recipient: it fans new events out to every open
 * socket, answers unread-count requests, and keeps the sockets hibernatable.
 */
export class NotificationDurableObject extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    const { pathname } = new URL(request.url);

    if (pathname === "/ws") {
      return await this.handleWebSocket(request);
    }

    if (pathname === "/broadcast" && request.method === "POST") {
      return await this.handleBroadcast(request);
    }

    if (pathname === "/unread-count" && request.method === "GET") {
      return Response.json({ count: await this.getUnreadCount() });
    }

    return new Response("Not found", { status: 404 });
  }

  async webSocketMessage(
    socket: WebSocket,
    message: string | ArrayBuffer
  ): Promise<void> {
    if (typeof message !== "string") {
      this.send(socket, {
        type: "error",
        message: "Binary messages unsupported",
      });
      return;
    }

    let payload: unknown;

    try {
      payload = JSON.parse(message);
    } catch {
      this.send(socket, { type: "error", message: "Invalid JSON" });
      return;
    }

    const parsed = notificationClientMessageSchema.safeParse(payload);

    if (!parsed.success) {
      this.send(socket, { type: "error", message: "Unsupported message" });
      return;
    }

    if (parsed.data.type === "ping") {
      this.send(socket, { type: "pong", timestamp: Date.now() });
      return;
    }

    this.send(socket, {
      type: "notification.unread_count",
      count: await this.readUnreadCount(),
    });
  }

  async webSocketClose(
    socket: WebSocket,
    code: number,
    reason: string
  ): Promise<void> {
    socket.close(code, reason);
  }

  async webSocketError(socket: WebSocket, error: unknown): Promise<void> {
    notificationLog.error(
      { recipientId: this.ctx.id.name, err: error },
      "notification.websocket.error"
    );

    try {
      socket.close(1011, "WebSocket error");
    } catch {
      // The socket is already gone.
    }
  }

  private async handleWebSocket(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected a WebSocket upgrade request", {
        status: 426,
      });
    }

    const { 0: client, 1: server } = new WebSocketPair();

    this.ctx.acceptWebSocket(server);

    this.send(server, {
      type: "connected",
      recipientId: this.recipientId,
      unreadCount: await this.readUnreadCount(),
    });

    return new Response(null, { status: 101, webSocket: client });
  }

  private async handleBroadcast(request: Request): Promise<Response> {
    const body = await request.json().catch(() => null);
    const parsed = notificationEventSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json(
        { error: "Invalid notification event", issues: parsed.error.issues },
        { status: 400 }
      );
    }

    // This object owns one recipient's sockets, so an event carrying another
    // recipient's notification is a producer bug, never something to deliver.
    if (
      parsed.data.type === "notification.created" &&
      parsed.data.notification.recipientId !== this.recipientId
    ) {
      return Response.json(
        { error: "Notification recipient mismatch" },
        { status: 400 }
      );
    }

    return Response.json({ delivered: this.broadcast(parsed.data) });
  }

  private broadcast(event: NotificationEvent): number {
    let delivered = 0;

    for (const socket of this.ctx.getWebSockets()) {
      if (socket.readyState !== WEB_SOCKET_OPEN) continue;

      this.send(socket, event);
      delivered += 1;
    }

    return delivered;
  }

  private send(socket: WebSocket, message: NotificationServerMessage): void {
    try {
      socket.send(JSON.stringify(message));
    } catch {
      try {
        socket.close(1011, "Notification send failed");
      } catch {
        // The socket is already gone.
      }
    }
  }

  private async getUnreadCount(): Promise<number> {
    const database = createDrizzleClient(this.env.DB);

    const [row] = await database
      .select({ count: count() })
      .from(NotificationTable)
      .where(
        and(
          eq(NotificationTable.recipientId, this.recipientId),
          eq(NotificationTable.isRead, false),
          eq(NotificationTable.isArchived, false)
        )
      );

    return row?.count ?? 0;
  }

  /**
   * The socket must still open when D1 is unavailable; the client can ask for
   * the count again later instead of losing the live connection.
   */
  private async readUnreadCount(): Promise<number> {
    try {
      return await this.getUnreadCount();
    } catch (error) {
      notificationLog.error({ err: error }, "notification.unread_count.failed");
      return 0;
    }
  }

  /** Durable objects are addressed by recipient id, so the name is required. */
  private get recipientId(): string {
    const recipientId = this.ctx.id.name;

    if (!recipientId) {
      throw new Error(
        "NotificationDurableObject must be addressed with a named instance"
      );
    }

    return recipientId;
  }
}
