import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

import { Button } from "#/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "#/components/ui/card";
import { env } from "#/lib/env";
import { orpcClient } from "#/oRPC/orpc";
import { detectDevice, type DevicePlatform } from "#/utils/detectDevice";
import { useSettingStore } from "#/zustand/setting/settingStore";
import { X } from "lucide-react";

import { usePushSubscription } from "../../api/notification.api.hook";
import type { SubscribePushNotificationContractType } from "../../api/notification.contract";
import {
  getPushSubscription,
  isPushConfigured,
  isPushManagerSupported,
  subscribeToPushNotifications,
  unsubscribeFromPushNotifications,
} from "../../push/push-notification";

type PushStatus = NotificationPermission | "unsupported";

/** Payload accepted by the subscribe endpoint. */
type PushSubscriptionPayload = SubscribePushNotificationContractType["input"];

function isSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "Notification" in window &&
    isPushManagerSupported()
  );
}

function isIOSStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function readPushStatus(): PushStatus {
  if (!isPushConfigured(env.VITE_WEB_PUSH_PUBLIC_KEY)) return "unsupported";
  if (!isSupported()) return "unsupported";

  return Notification.permission;
}

/** Hydration-safe "are we on the client" flag without a setState in an effect. */
const subscribeToNothing = () => () => {};

function useIsClient(): boolean {
  return useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false
  );
}

function isPushSupportedOnPlatform(platform: DevicePlatform): boolean {
  // iOS only exposes push to a home-screen app, and some iOS versions still
  // lack PushManager, so both conditions have to hold.
  if (platform === "ios") return isIOSStandalone() && isSupported();
  return isSupported();
}

async function requestPlatformPermission(
  platform: DevicePlatform
): Promise<NotificationPermission> {
  if (!isPushSupportedOnPlatform(platform)) return "denied";

  return Notification.requestPermission();
}

/** Read the current device subscription as an API payload, if there is one. */
async function readDeviceSubscription(
  platform: DevicePlatform
): Promise<PushSubscriptionPayload | null> {
  if (!isPushSupportedOnPlatform(platform)) return null;

  const subscription = await getPushSubscription();
  const { endpoint, keys, expirationTime } = subscription?.toJSON() ?? {};

  if (!endpoint || !keys?.p256dh || !keys.auth) return null;

  return {
    endpoint,
    p256dh: keys.p256dh,
    auth: keys.auth,
    expirationTime,
  };
}

/**
 * Bind this device's push subscription to the signed-in user.
 *
 * Used by the silent mount reconciliation, which should not raise toasts.
 */
async function registerDevice(publicKey: string): Promise<void> {
  const subscription = await subscribeToPushNotifications(publicKey);
  const { endpoint, keys, expirationTime } = subscription.toJSON();

  if (!endpoint || !keys?.p256dh || !keys.auth) return;

  await orpcClient.notification.subscribe({
    endpoint,
    p256dh: keys.p256dh,
    auth: keys.auth,
    expirationTime,
  });
}

/**
 * Forget this device.
 *
 * The endpoint is read before the browser drops the subscription: afterwards
 * there is nothing left to identify the device to the server, and a delete by
 * user alone would disable push on every other device the user owns.
 *
 * `deleteSubscription` is injected so a user-initiated change can go through
 * the mutation (with its toast) while the silent mount sync can call the
 * client directly.
 */
async function forgetDevice(
  platform: DevicePlatform,
  deleteSubscription: (endpoint: string) => Promise<unknown>
): Promise<void> {
  const existing = await readDeviceSubscription(platform);

  if (!existing) return;

  await unsubscribeFromPushNotifications();
  await deleteSubscription(existing.endpoint);
}

export function NotificationPermissionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  // Read the browser permission lazily during render instead of in an effect:
  // it is external state that only changes on reload or after a prompt.
  const [status, setStatus] = useState<PushStatus>(readPushStatus);

  // The platform cannot change without a reload, so this is read once.
  const [platform] = useState(() => detectDevice().platform);
  const isClient = useIsClient();

  const { subscribe, unsubscribe } = usePushSubscription();

  const requestPermission = useCallback(async () => {
    try {
      const result = await requestPlatformPermission(platform);
      setStatus(result);

      if (result === "granted") {
        const publicKey = env.VITE_WEB_PUSH_PUBLIC_KEY;

        if (isPushConfigured(publicKey)) {
          const subscription = await subscribeToPushNotifications(publicKey);
          const { endpoint, keys, expirationTime } = subscription.toJSON();

          if (endpoint && keys?.p256dh && keys.auth) {
            subscribe.mutate({
              endpoint,
              p256dh: keys.p256dh,
              auth: keys.auth,
              expirationTime,
            });
          }
        }
      } else if (result === "denied") {
        await forgetDevice(platform, (endpoint) =>
          unsubscribe.mutateAsync({ endpoint })
        );
      }

      return result;
    } catch (error) {
      console.error("Notification permission request failed:", error);
      return "denied" as const;
    }
  }, [platform, subscribe, unsubscribe]);

  // Reconcile the browser with the server on mount and whenever the permission
  // changes. This runs on every dashboard load, so it is deliberately silent:
  // no toast and no prompt.
  useEffect(() => {
    const publicKey = env.VITE_WEB_PUSH_PUBLIC_KEY;

    if (!isPushConfigured(publicKey) || status === "unsupported") return;

    const state = { cancelled: false };

    void (async () => {
      try {
        if (status === "granted") {
          // Permission outlives the subscription (cleared storage, expired
          // endpoint, new browser profile), so re-register when it is missing.
          const existing = await readDeviceSubscription(platform);

          if (!existing && !state.cancelled) await registerDevice(publicKey);
        } else if (status === "denied") {
          await forgetDevice(platform, (endpoint) =>
            orpcClient.notification.unsubscribe({ endpoint })
          );
        }
      } catch (error) {
        console.error("Notification subscription sync failed:", error);
      }
    })();

    return () => {
      state.cancelled = true;
    };
  }, [platform, status]);

  const dismissed = useSettingStore(
    (state) => state.notification.promptDismissed
  );
  const dismissNotificationPrompt = useSettingStore(
    (state) => state.dismissNotificationPrompt
  );

  const isUndecided = isClient && status === "default" && !dismissed;
  const canPrompt = isUndecided && isPushSupportedOnPlatform(platform);

  // iOS in a tab: push exists but only from the installed app, so explain that
  // instead of showing an Allow button the browser would refuse.
  const needsInstallHint =
    isUndecided && platform === "ios" && !isIOSStandalone();

  return (
    <>
      {children}
      {(canPrompt || needsInstallHint) && (
        <NotificationPromptCard
          canPrompt={canPrompt}
          onAllow={requestPermission}
          onDismiss={dismissNotificationPrompt}
          isPending={subscribe.isPending}
        />
      )}
    </>
  );
}

function NotificationPromptCard({
  canPrompt,
  onAllow,
  onDismiss,
  isPending,
}: {
  canPrompt: boolean;
  onAllow: () => void;
  onDismiss: () => void;
  isPending: boolean;
}) {
  return (
    // Fixed, not a modal: the page underneath must stay scrollable.
    <aside
      className="fixed right-4 bottom-4 z-50 w-80"
      aria-label="Enable notifications"
    >
      <Card className="shadow-lg">
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="text-sm leading-snug">
              {canPrompt ? "Stay in the loop" : "Enable notifications (PWA)"}
            </CardTitle>
            <button
              type="button"
              onClick={onDismiss}
              className="mt-0.5 shrink-0 text-muted-foreground hover:text-foreground"
              aria-label="Dismiss"
            >
              <X size={14} />
            </button>
          </div>
          <CardDescription className="text-xs">
            {canPrompt
              ? "Get real-time updates by allowing push notifications."
              : "Push notifications on iOS only work once this app is on your Home Screen."}
          </CardDescription>
        </CardHeader>
        {!canPrompt && (
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Open in Safari and tap <strong>Share → Add to Home Screen</strong>
              , then allow notifications from the installed app.
            </p>
          </CardContent>
        )}
        <CardFooter className="gap-2">
          {canPrompt ? (
            <>
              <Button onClick={onAllow} className="flex-1" disabled={isPending}>
                Allow
              </Button>
              <Button
                variant="outline"
                onClick={onDismiss}
                className="flex-1"
                disabled={isPending}
              >
                Not now
              </Button>
            </>
          ) : (
            <Button variant="outline" onClick={onDismiss} className="w-full">
              Got it
            </Button>
          )}
        </CardFooter>
      </Card>
    </aside>
  );
}
