import { beforeEach, describe, expect, it, vi } from "vitest";

import { MailError } from "../mail.error";
import { createMailTransport } from "./mailTransport.factory";

const { resendCtor, workerCtor } = vi.hoisted(() => ({
  resendCtor: vi.fn(),
  workerCtor: vi.fn(),
}));

vi.mock("./resend.transport", () => ({
  ResendMailTransport: class {
    constructor(apiKey: string) {
      resendCtor(apiKey);
    }
  },
}));

vi.mock("./workerMailer.transport", () => ({
  WorkerMailerTransport: class {
    constructor(options: unknown) {
      workerCtor(options);
    }
  },
}));

const smtp = {
  SMTP_HOST: "smtp.example.com",
  SMTP_PORT: "587",
  SMTP_USERNAME: "user@example.com",
  SMTP_PASSWORD: "secret",
};

describe("createMailTransport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("prefers Resend when both the API key and SMTP settings are available", () => {
    createMailTransport({ RESEND_API_KEY: "re_123", ...smtp });

    expect(resendCtor).toHaveBeenCalledWith("re_123");
    expect(workerCtor).not.toHaveBeenCalled();
  });

  it("uses SMTP when no Resend API key is set", () => {
    createMailTransport(smtp);

    expect(workerCtor).toHaveBeenCalledWith({
      host: "smtp.example.com",
      port: 587,
      secure: false,
      credentials: {
        username: "user@example.com",
        password: "secret",
      },
    });
    expect(resendCtor).not.toHaveBeenCalled();
  });

  it("treats a blank Resend API key as absent", () => {
    createMailTransport({ RESEND_API_KEY: "   ", ...smtp });

    expect(resendCtor).not.toHaveBeenCalled();
    expect(workerCtor).toHaveBeenCalledTimes(1);
  });

  it("uses implicit TLS on SMTP port 465", () => {
    createMailTransport({ ...smtp, SMTP_PORT: "465" });

    expect(workerCtor).toHaveBeenCalledWith(
      expect.objectContaining({ port: 465, secure: true })
    );
  });

  it("throws when neither transport is configured", () => {
    expect(() => createMailTransport({})).toThrow(MailError);
    expect(() => createMailTransport({})).toThrow(
      /No mail transport configured/
    );
  });

  it("throws when SMTP settings are incomplete", () => {
    expect(() =>
      createMailTransport({ ...smtp, SMTP_PASSWORD: undefined })
    ).toThrow(/No mail transport configured/);
    expect(workerCtor).not.toHaveBeenCalled();
  });

  it("throws when the SMTP port is not a number", () => {
    expect(() =>
      createMailTransport({ ...smtp, SMTP_PORT: "not-a-port" })
    ).toThrow(/SMTP_PORT must be a number/);
    expect(workerCtor).not.toHaveBeenCalled();
  });
});
