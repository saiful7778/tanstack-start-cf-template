import { describe, expect, it, vi } from "vitest";

import { updateUserProfile } from "./profileUpdate";

describe("updateUserProfile", () => {
  it("sends only the editable name to the auth client", async () => {
    const updateUser = vi.fn().mockResolvedValue({ data: { status: true } });

    await updateUserProfile({ updateUser }, "Updated Name");

    expect(updateUser).toHaveBeenCalledWith({ name: "Updated Name" });
  });
});
