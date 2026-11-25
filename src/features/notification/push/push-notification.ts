import {
  getReadyServiceWorker,
  isServiceWorkerSupported,
} from "#/lib/service-worker";

/**
 * Check if push manager is supported
 * @returns {boolean} True if push manager is supported, false otherwise
 */
export function isPushManagerSupported(): boolean {
  return isServiceWorkerSupported() && "PushManager" in window;
}

/**
 * Check if this deployment has the VAPID keys needed to push.
 *
 * Without them `pushManager.subscribe` cannot run, so the UI must not offer to
 * enable push.
 */
export function isPushConfigured(
  vapidPublicKey: string | undefined
): vapidPublicKey is string {
  return typeof vapidPublicKey === "string" && vapidPublicKey.length > 0;
}

/**
 * Get the current push subscription
 * @returns {Promise<PushSubscription | null>} The push subscription if it exists
 */
export async function getPushSubscription(): Promise<PushSubscription | null> {
  if (!isPushManagerSupported()) {
    throw new Error("Push notifications are not supported");
  }

  const registration = await getReadyServiceWorker();
  return registration.pushManager.getSubscription();
}

/**
 * Subscribe to push notifications
 * @param vapidPublicKey The VAPID public key
 * @returns {Promise<PushSubscription>} The push subscription
 */
export async function subscribeToPushNotifications(
  vapidPublicKey: string | BufferSource
): Promise<PushSubscription> {
  if (!isPushManagerSupported()) {
    throw new Error("Push notifications are not supported");
  }

  const subscription = await getPushSubscription();

  if (subscription) {
    return subscription;
  }

  const registration = await getReadyServiceWorker();
  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: vapidPublicKey,
  });
}

/**
 * Unsubscribe from push notifications
 * @returns {Promise<PushSubscription | null>} The subscription that was removed
 */
export async function unsubscribeFromPushNotifications(): Promise<PushSubscription | null> {
  if (!isPushManagerSupported()) {
    throw new Error("Push notifications are not supported");
  }

  const subscription = await getPushSubscription();

  if (!subscription) {
    return null;
  }

  await subscription.unsubscribe();

  return subscription;
}
