import { describe, expect, it } from "vitest";

import { secureAccountUrl } from "./authUrls";

describe("secureAccountUrl", () => {
  it("links to the existing update-password settings page", () => {
    expect(secureAccountUrl("https://example.com")).toBe(
      "https://example.com/dashboard/settings/update-password"
    );
  });
});
