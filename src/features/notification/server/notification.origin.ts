/**
 * Decide whether a browser may open an authenticated notification socket.
 *
 * A WebSocket handshake carries the session cookie, so without this check any
 * page on another origin could subscribe to the victim's notifications
 * (cross-site WebSocket hijacking). Browsers always send `Origin` on an
 * upgrade request, so a missing header is rejected.
 *
 * Same-origin is allowed in addition to the configured site URL so preview
 * deployments and custom domains keep working.
 */
export function isAllowedNotificationOrigin({
  requestUrl,
  origin,
  siteUrl,
}: {
  requestUrl: string;
  origin: string | null;
  siteUrl: string;
}): boolean {
  if (!origin) return false;

  const requestOrigin = safeOrigin(requestUrl);
  const requestedOrigin = safeOrigin(origin);

  if (!requestedOrigin) return false;
  if (requestedOrigin === requestOrigin) return true;

  const configuredOrigin = safeOrigin(siteUrl);

  return configuredOrigin !== null && requestedOrigin === configuredOrigin;
}

function safeOrigin(value: string): string | null {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}
