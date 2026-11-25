import { describe, expect, it, vi } from "vitest";

import type { NotificationDto } from "../notification.types";
import type { NotificationChannels } from "../server/notification.service";
import { deliverNotification } from "./delivery.orchestrator";

const notification: NotificationDto = {
  id: "00000000-0000-4000-8000-000000000001",
  recipientId: "11111111-1111-4111-8111-111111111111",
  actorId: null,
  category: "SYSTEM",
  level: "INFO",
  title: "Heads up",
  message: "Something happened",
  data: null,
  isRead: false,
  readAt: null,
  isArchived: false,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const ALL: NotificationChannels = { inApp: true, push: true, email: true };
const NONE: NotificationChannels = {
  inApp: false,
  push: false,
  email: false,
};

function deps() {
  return {
    inApp: vi.fn(async () => true),
    push: { dispatch: vi.fn(async () => ({ delivered: 2, pruned: 0 })) },
    email: { dispatch: vi.fn(async () => ({ accepted: 1 as const })) },
  };
}

describe("deliverNotification", () => {
  it("delivers on every channel and reports each outcome", async () => {
    const d = deps();

    const report = await deliverNotification(notification, ALL, d);

    expect(report.delivered).toBe(true);
    expect(report.inApp.outcome).toBe("delivered");
    expect(report.push.outcome).toBe("delivered");
    expect(report.email.outcome).toBe("delivered");
    expect(report.push.detail).toEqual({ delivered: 2, pruned: 0 });
    expect(report.email.detail).toEqual({ accepted: 1 });
    expect(d.inApp).toHaveBeenCalledWith(notification);
  });

  it("reports disabled channels instead of omitting them", async () => {
    const d = deps();

    const report = await deliverNotification(notification, NONE, d);

    expect(report.delivered).toBe(false);
    expect(report.inApp.outcome).toBe("disabled");
    expect(report.push.outcome).toBe("disabled");
    expect(report.email.outcome).toBe("disabled");
    expect(d.inApp).not.toHaveBeenCalled();
    expect(d.push.dispatch).not.toHaveBeenCalled();
    expect(d.email.dispatch).not.toHaveBeenCalled();
  });

  it("is not 'delivered' when every enabled channel fails", async () => {
    const d = deps();
    d.inApp.mockRejectedValueOnce(new Error("socket"));
    d.push.dispatch.mockRejectedValueOnce(new Error("push"));
    d.email.dispatch.mockRejectedValueOnce(new Error("mail"));

    const report = await deliverNotification(notification, ALL, d);

    expect(report.delivered).toBe(false);
    expect(report.inApp.outcome).toBe("failed");
    expect(report.push.outcome).toBe("failed");
    expect(report.email.outcome).toBe("failed");
  });

  it("still delivers when only one channel succeeds", async () => {
    const d = deps();
    d.push.dispatch.mockRejectedValueOnce(new Error("push down"));

    const report = await deliverNotification(notification, ALL, d);

    expect(report.delivered).toBe(true);
    expect(report.push.outcome).toBe("failed");
    expect(report.email.outcome).toBe("delivered");
  });

  it("runs in-app to completion before starting push and email", async () => {
    const order: string[] = [];

    const report = await deliverNotification(notification, ALL, {
      inApp: async () => {
        order.push("inApp:start");
        await Promise.resolve();
        order.push("inApp:end");
        return true;
      },
      push: {
        dispatch: async () => {
          order.push("push");
          return { delivered: 1, pruned: 0 };
        },
      },
      email: {
        dispatch: async () => {
          order.push("email");
          return { accepted: 1 };
        },
      },
    });

    expect(report.delivered).toBe(true);
    expect(order.indexOf("inApp:end")).toBeLessThan(order.indexOf("push"));
    expect(order.indexOf("inApp:end")).toBeLessThan(order.indexOf("email"));
  });

  it("runs push and email concurrently", async () => {
    let pushStarted = false;
    let emailStartedWhilePushInFlight = false;

    await deliverNotification(notification, ALL, {
      inApp: async () => true,
      push: {
        dispatch: async () => {
          pushStarted = true;
          // Give the email channel a turn while this is unresolved.
          await new Promise((resolve) => setTimeout(resolve, 10));
          return { delivered: 1, pruned: 0 };
        },
      },
      email: {
        dispatch: async () => {
          if (pushStarted) emailStartedWhilePushInFlight = true;
          return { accepted: 1 };
        },
      },
    });

    expect(emailStartedWhilePushInFlight).toBe(true);
  });

  it("times out a hung channel without blocking the others", async () => {
    const report = await deliverNotification(
      notification,
      ALL,
      {
        inApp: async () => true,
        push: {
          // Never resolves: simulates an unresponsive push endpoint.
          dispatch: () => new Promise(() => {}),
        },
        email: { dispatch: async () => ({ accepted: 1 }) },
      },
      { channelTimeoutMs: 20 }
    );

    expect(report.push.outcome).toBe("timeout");
    expect(report.email.outcome).toBe("delivered");
    expect(report.inApp.outcome).toBe("delivered");
    expect(report.delivered).toBe(true);
  });

  it("a hung in-app broadcast does not prevent push or email", async () => {
    const report = await deliverNotification(
      notification,
      ALL,
      {
        inApp: () => new Promise(() => {}),
        push: { dispatch: async () => ({ delivered: 1, pruned: 0 }) },
        email: { dispatch: async () => ({ accepted: 1 }) },
      },
      { channelTimeoutMs: 20 }
    );

    expect(report.inApp.outcome).toBe("timeout");
    expect(report.push.outcome).toBe("delivered");
    expect(report.email.outcome).toBe("delivered");
  });

  it("records a duration for every channel", async () => {
    const report = await deliverNotification(notification, ALL, deps());

    for (const channel of [report.inApp, report.push, report.email]) {
      expect(channel.durationMs).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(channel.durationMs)).toBe(true);
    }

    expect(report.durationMs).toBeGreaterThanOrEqual(0);
  });
});
