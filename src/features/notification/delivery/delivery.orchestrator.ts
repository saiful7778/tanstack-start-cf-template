import { notificationLog } from "#/lib/logger.server";

import type {
  EmailDeliveryResult,
  NotificationEmailDispatcher,
} from "../email/notification.email";
import type { NotificationDto } from "../notification.types";
import type {
  NotificationPushDispatcher,
  PushDeliveryResult,
} from "../push/push.dispatcher";
import type { NotificationChannels } from "../server/notification.service";

/** Channels a notification can be delivered on. */
export type NotificationChannel = "inApp" | "push" | "email";

/** How one channel ended. */
export type ChannelOutcome =
  "delivered" | "failed" | "timeout" | "skipped" | "disabled";

export interface ChannelReport<TDetail> {
  channel: NotificationChannel;
  outcome: ChannelOutcome;
  /** Wall-clock time spent on this channel. */
  durationMs: number;
  /** Channel-specific payload (counts, skip reason, error message). */
  detail: TDetail;
}

export interface DeliveryReport {
  /** Overall verdict: did at least one channel deliver? */
  delivered: boolean;
  inApp: ChannelReport<boolean>;
  push: ChannelReport<PushDeliveryResult>;
  email: ChannelReport<EmailDeliveryResult>;
  /** Total wall-clock time for the whole plan. */
  durationMs: number;
}

export interface DeliveryPlanDependencies {
  inApp: (notification: NotificationDto) => Promise<boolean>;
  push: NotificationPushDispatcher;
  email: NotificationEmailDispatcher;
}

export interface DeliveryPlanOptions {
  /**
   * Per-channel deadline.
   *
   * A channel that exceeds it is reported as `timeout` and the plan moves on.
   * Racing does not cancel the underlying work (the dispatchers take no
   * signal), but it stops one hung push endpoint delaying the rest.
   *
   * @default 5_000
   */
  channelTimeoutMs?: number;
}

const DEFAULT_CHANNEL_TIMEOUT_MS = 5_000;

const SKIPPED_PUSH: PushDeliveryResult = { delivered: 0, pruned: 0 };
const SKIPPED_EMAIL: EmailDeliveryResult = {
  accepted: 0,
  skipped: "not_queued",
};

/** Thrown internally when a channel exceeds its deadline. */
class ChannelTimeoutError extends Error {
  constructor(readonly timeoutMs: number) {
    super(`Channel exceeded ${timeoutMs}ms`);
    this.name = "ChannelTimeoutError";
  }
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number
): Promise<T | ChannelTimeoutError> {
  return Promise.race([
    promise,
    new Promise<ChannelTimeoutError>((resolve) => {
      setTimeout(() => resolve(new ChannelTimeoutError(timeoutMs)), timeoutMs);
    }),
  ]);
}

/**
 * Run one channel with full isolation.
 *
 * Every failure mode collapses to an outcome rather than an exception: a
 * notification must never fail because one transport is down, and the caller
 * needs to know *which* channel failed and how long it took.
 */
async function runChannel<TDetail>({
  channel,
  enabled,
  fallback,
  timeoutMs,
  run,
}: {
  channel: NotificationChannel;
  enabled: boolean;
  fallback: TDetail;
  timeoutMs: number;
  run: () => Promise<TDetail>;
}): Promise<ChannelReport<TDetail>> {
  if (!enabled) {
    return { channel, outcome: "disabled", durationMs: 0, detail: fallback };
  }

  const startedAt = performance.now();

  try {
    const result = await withTimeout(run(), timeoutMs);

    if (result instanceof ChannelTimeoutError) {
      notificationLog.error(
        { channel, timeoutMs, outcome: "timeout" },
        "notification.delivery.timeout"
      );

      return {
        channel,
        outcome: "timeout",
        durationMs: Math.round(performance.now() - startedAt),
        detail: fallback,
      };
    }

    return {
      channel,
      outcome: "delivered",
      durationMs: Math.round(performance.now() - startedAt),
      detail: result,
    };
  } catch (error) {
    notificationLog.error(
      { channel, err: error, outcome: "failed" },
      "notification.delivery.failed"
    );

    return {
      channel,
      outcome: "failed",
      durationMs: Math.round(performance.now() - startedAt),
      detail: fallback,
    };
  }
}

/**
 * Deliver one already-persisted notification across its enabled channels.
 *
 * ## The algorithm
 *
 * The row is committed before this runs (see `NotificationService`), so this
 * function only decides *how* to deliver, never *whether* to store.
 *
 * 1. **In-app is awaited first.** It is one durable-object request (fast), it
 *    updates the unread badge, and it is the channel a user with the app open
 *    actually sees. Awaiting it means the live event has landed by the time
 *    `sendNotification` resolves.
 *
 * 2. **Push and email then run concurrently.** They are independent: push fans
 *    out to N devices, email enqueues one job. Running them in parallel makes
 *    total latency `inApp + max(push, email)` instead of the sum of all three.
 *
 * 3. **Every channel is isolated** — its own timeout and its own error
 *    boundary. A hung push endpoint cannot delay email, and neither can fail
 *    the notification.
 *
 * 4. **Disabled channels are reported, not omitted**, so a caller can tell
 *    "the user turned email off" apart from "email silently didn't happen" —
 *    which is exactly the bug this shape exists to prevent.
 */
export async function deliverNotification(
  notification: NotificationDto,
  channels: NotificationChannels,
  dependencies: DeliveryPlanDependencies,
  { channelTimeoutMs = DEFAULT_CHANNEL_TIMEOUT_MS }: DeliveryPlanOptions = {}
): Promise<DeliveryReport> {
  const startedAt = performance.now();

  // Phase 1: the fast, user-visible channel, in order.
  const inApp = await runChannel({
    channel: "inApp",
    enabled: channels.inApp,
    fallback: false,
    timeoutMs: channelTimeoutMs,
    run: () => dependencies.inApp(notification),
  });

  // Phase 2: the slow, independent channels, in parallel.
  const [push, email] = await Promise.all([
    runChannel({
      channel: "push",
      enabled: channels.push,
      fallback: SKIPPED_PUSH,
      timeoutMs: channelTimeoutMs,
      run: () => dependencies.push.dispatch(notification),
    }),
    runChannel({
      channel: "email",
      enabled: channels.email,
      fallback: SKIPPED_EMAIL,
      timeoutMs: channelTimeoutMs,
      run: () => dependencies.email.dispatch(notification),
    }),
  ]);

  return {
    delivered:
      inApp.outcome === "delivered" ||
      push.outcome === "delivered" ||
      email.outcome === "delivered",
    inApp,
    push,
    email,
    durationMs: Math.round(performance.now() - startedAt),
  };
}
