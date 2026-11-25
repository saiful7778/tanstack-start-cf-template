import type { DatabaseType } from "#/db/clients/drizzle-client";
import { mail } from "#/lib/mail.server";

import type { DeliveryReport } from "../delivery/delivery.orchestrator";
import { createNotificationEmailDispatcher } from "../email/notification.email";
import type { NotificationEmailDispatcher } from "../email/notification.email";
import type {
  CreateNotificationInput,
  NotificationDto,
} from "../notification.types";
import {
  notificationHubFor,
  type NotificationHubSource,
} from "../server/notification.hub.server";
import {
  NotificationService,
  type NotificationChannels,
} from "../server/notification.service";
import {
  createWebPushDispatcher,
  type NotificationPushDispatcher,
} from "./push.dispatcher";

export interface SendNotificationProps {
  database: DatabaseType;
  payload: CreateNotificationInput;
  /**
   * Resolves the recipient's live hub. Defaults to the worker's durable object
   * binding; injected in tests so no Durable Object is required.
   */
  hubFor?: NotificationHubSource;
  /**
   * Push transport. Defaults to Web Push over VAPID.
   *
   * Only override this in tests: the default is what actually reaches devices.
   */
  push?: NotificationPushDispatcher;
  /**
   * Email transport. Defaults to the queued mail pipeline.
   *
   * Only override this in tests.
   */
  email?: NotificationEmailDispatcher;
  /**
   * Channels to attempt. Defaults to the channels enabled in the recipient's
   * settings for this category.
   */
  channels?: NotificationChannels;
}

export interface SendNotificationResult {
  /** `null` when every channel was disabled for the category. */
  notification: NotificationDto | null;
  /** Per-channel outcome, timing and failure reason. */
  delivery: DeliveryReport;
}

/**
 * Send a notification to one recipient across every configured channel.
 *
 * This is the entry point the app should use. It wires the *real* transports
 * (Web Push and the queued mail pipeline) by default, so in-app, push and email
 * all actually deliver.
 *
 * That default matters: an earlier version of this function constructed the
 * service without an email dispatcher, which silently turned the email channel
 * into a no-op for every caller. The service falls back to no-op dispatchers by
 * design, so a wrapper must always supply the real ones.
 *
 * The delivery algorithm — sequential in-app, then push and email in parallel,
 * each isolated by timeout and error boundary — lives in
 * {@link deliverNotification} and is applied by the service.
 */
export async function sendNotification({
  database,
  payload,
  hubFor = notificationHubFor,
  push,
  email,
  channels,
}: SendNotificationProps): Promise<SendNotificationResult> {
  const service = new NotificationService(database, hubFor, {
    push: push ?? createWebPushDispatcher(database),
    email: email ?? createNotificationEmailDispatcher({ database, mail }),
  });

  const { notification, delivery } = await service.createWithResult(payload, {
    channels,
  });

  return { notification, delivery };
}
