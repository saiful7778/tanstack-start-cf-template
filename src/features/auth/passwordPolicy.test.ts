import { describe, expect, it } from "vitest";

import { assertPasswordPolicy } from "./passwordPolicy";

describe("assertPasswordPolicy", () => {
  it("accepts a password with upper, lower and numeric characters", () => {
    expect(() => assertPasswordPolicy("Passw0rd")).not.toThrow();
  });

  it("rejects a password without a numeric character", () => {
    expect(() => assertPasswordPolicy("Password")).toThrow(/number/);
  });

  it("rejects a password without an uppercase character", () => {
    expect(() => assertPasswordPolicy("passw0rd")).toThrow(/uppercase/);
  });
});
