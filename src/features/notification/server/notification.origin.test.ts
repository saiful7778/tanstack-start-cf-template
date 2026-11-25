import { describe, expect, it } from "vitest";

import { isAllowedNotificationOrigin } from "./notification.origin";

const siteUrl = "https://app.example.com";

describe("isAllowedNotificationOrigin", () => {
  it("allows the origin the request was made to", () => {
    expect(
      isAllowedNotificationOrigin({
        requestUrl: "https://app.example.com/api/notifications/ws",
        origin: "https://app.example.com",
        siteUrl,
      })
    ).toBe(true);
  });

  it("allows the configured site url on another host (custom domain)", () => {
    expect(
      isAllowedNotificationOrigin({
        requestUrl: "https://preview.example.workers.dev/api/notifications/ws",
        origin: "https://app.example.com",
        siteUrl,
      })
    ).toBe(true);
  });

  it("rejects a foreign origin", () => {
    expect(
      isAllowedNotificationOrigin({
        requestUrl: "https://app.example.com/api/notifications/ws",
        origin: "https://evil.example",
        siteUrl,
      })
    ).toBe(false);
  });

  it("rejects a missing origin header", () => {
    expect(
      isAllowedNotificationOrigin({
        requestUrl: "https://app.example.com/api/notifications/ws",
        origin: null,
        siteUrl,
      })
    ).toBe(false);
  });

  it("rejects a malformed origin", () => {
    expect(
      isAllowedNotificationOrigin({
        requestUrl: "https://app.example.com/api/notifications/ws",
        origin: "not a url",
        siteUrl,
      })
    ).toBe(false);
  });

  it("rejects a lookalike subdomain", () => {
    expect(
      isAllowedNotificationOrigin({
        requestUrl: "https://app.example.com/api/notifications/ws",
        origin: "https://app.example.com.evil.example",
        siteUrl,
      })
    ).toBe(false);
  });
});
