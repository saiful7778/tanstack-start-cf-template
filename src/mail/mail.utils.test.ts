import { describe, expect, it } from "vitest";

import { cleanMessageId } from "./mail.utils";

describe("cleanMessageId", () => {
  it("strips angle brackets", () => {
    expect(cleanMessageId("<abc@x.com>")).toBe("abc@x.com");
  });

  it("leaves an already-clean id alone", () => {
    expect(cleanMessageId("abc@x.com")).toBe("abc@x.com");
  });

  it("trims surrounding whitespace", () => {
    expect(cleanMessageId("  <abc@x.com>  ")).toBe("abc@x.com");
  });

  it("strips only one bracket pair", () => {
    expect(cleanMessageId("<<abc@x.com>>")).toBe("<abc@x.com>");
  });
});
