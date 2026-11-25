/// <reference lib="esnext" />
/// <reference lib="webworker" />
import { defaultCache } from "@serwist/vite/worker";
import type {
  PrecacheEntry,
  RuntimeCaching,
  SerwistGlobalConfig,
} from "serwist";
import { NetworkOnly, Serwist } from "serwist";

import { DEFAULT_AUTH_PATH } from "./constants";
import type { NotificationDto } from "./features/notification/notification.types";

// This declares the value of `injectionPoint` to TypeScript.
// `injectionPoint` is the string that will be replaced by the
// actual precache manifest. By default, this string is set to
// `"self.__SW_MANIFEST"`.
declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

/**
 * Personalized responses must never be served from a shared cache: after a
 * logout, a cached dashboard or RPC payload would keep rendering the previous
 * user's data. Only the static-asset entries keep their default strategy.
 *
 * `defaultCache` ends with catch-alls for document navigations and `/api/*`
 * responses. They are detected by probing them with URLs they would match.
 */
const PERSONALIZED_PROBES = [
  "/dashboard",
  "/api/rpc/notification/list",
] as const;

function isPersonalized(matcher: RuntimeCaching["matcher"]): boolean {
  if (!(matcher instanceof RegExp)) return false;

  return PERSONALIZED_PROBES.some((probe) => matcher.test(probe));
}

function withoutPersonalizedCaching(
  entries: readonly RuntimeCaching[]
): RuntimeCaching[] {
  return entries.map((entry) =>
    isPersonalized(entry.matcher)
      ? { ...entry, handler: new NetworkOnly() }
      : entry
  );
}

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: withoutPersonalizedCaching(defaultCache),
});

serwist.addEventListeners();

/**
 * Push payloads are the serialized notification row, so only the fields the
 * notification needs are required here.
 */
type PushPayload = Pick<NotificationDto, "id" | "title" | "message" | "data">;

function readPushPayload(event: PushEvent): PushPayload | null {
  try {
    const payload = event.data?.json() as Partial<PushPayload> | null;

    if (!payload?.title) return null;

    return {
      id: payload.id ?? "notification",
      title: payload.title,
      message: payload.message ?? "",
      data: payload.data ?? null,
    };
  } catch {
    // A malformed payload is not worth retrying; dropping it keeps the
    // service worker from reporting an unhandled rejection.
    return null;
  }
}

self.addEventListener("push", (event) => {
  const payload = readPushPayload(event);

  if (!payload) return;

  event.waitUntil(
    (async () => {
      try {
        const windowClients = await self.clients.matchAll({
          type: "window",
          includeUncontrolled: true,
        });

        // The in-app panel already shows the notification; a system banner on
        // top of it is noise.
        if (windowClients.some((client) => client.focused)) return;

        await self.registration.showNotification(payload.title, {
          body: payload.message,
          data: { ...payload.data, url: DEFAULT_AUTH_PATH },
        });
      } catch (error) {
        console.error("Failed to show notification:", error);
      }
    })()
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = new URL(
    (event.notification.data as { url?: string } | null)?.url ??
      DEFAULT_AUTH_PATH,
    self.location.origin
  ).href;

  event.waitUntil(
    (async () => {
      const windowClients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      for (const client of windowClients) {
        // Compare resolved URLs: `client.url` is always absolute.
        if (client.url === targetUrl && "focus" in client) {
          return client.focus();
        }
      }

      return self.clients.openWindow(targetUrl);
    })()
  );
});
