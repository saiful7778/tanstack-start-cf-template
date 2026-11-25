import { render, toPlainText } from "react-email";
import { describe, expect, it } from "vitest";

import NotificationMail from "./NotificationMail";

const props = {
  userName: "Ada Lovelace",
  appName: "Test App",
  supportMail: "help@test.example",
  title: "Export ready",
  message: "Your report is ready to download.",
  category: "System",
  level: "Warning",
};

describe("NotificationMail", () => {
  it("renders the notification copy into the email body", async () => {
    const html = await render(<NotificationMail {...props} />);
    const text = toPlainText(html);

    expect(html).toContain("Export ready");
    expect(text).toContain("Hello Ada Lovelace,");
    expect(text).toContain("Your report is ready to download.");
    expect(text).toContain("System · Warning");
  });

  it("includes the app name and support address from the layout", async () => {
    const html = await render(<NotificationMail {...props} />);

    expect(html).toContain("Test App");
    expect(html).toContain("help@test.example");
  });

  it("mentions how to opt out of the category", async () => {
    const text = toPlainText(await render(<NotificationMail {...props} />));

    expect(text).toContain("notification settings");
  });
});
