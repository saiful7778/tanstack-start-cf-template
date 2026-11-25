import { breadcrumbRoutes } from "#/constants";
import { describe, expect, it } from "vitest";

import { findBreadcrumbs } from "./AppBreadcrumb";

function titles(pathname: string): string[] {
  return findBreadcrumbs(breadcrumbRoutes, pathname).map(
    (route) => route.title
  );
}

describe("findBreadcrumbs", () => {
  it("resolves the dashboard root", () => {
    expect(titles("/dashboard")).toEqual(["Dashboard"]);
  });

  it("resolves a top-level dashboard child", () => {
    expect(titles("/dashboard/users")).toEqual(["Dashboard", "All Users"]);
  });

  it("resolves the notifications page", () => {
    expect(titles("/dashboard/notifications")).toEqual([
      "Dashboard",
      "Notifications",
    ]);
  });

  it("resolves a nested settings page", () => {
    expect(titles("/dashboard/settings/profile")).toEqual([
      "Dashboard",
      "Settings",
      "Profile",
    ]);
  });

  it("resolves the notification settings page", () => {
    expect(titles("/dashboard/settings/notification")).toEqual([
      "Dashboard",
      "Settings",
      "Notifications",
    ]);
  });

  it("returns an empty trail for an unmapped path", () => {
    expect(titles("/dashboard/unknown")).toEqual(["Dashboard"]);
    expect(titles("/nope")).toEqual([]);
  });
});
