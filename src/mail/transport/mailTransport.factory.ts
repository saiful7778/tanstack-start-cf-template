import { MailError } from "../mail.error";
import type {
  IMailTransport,
  MailTransportConfig,
} from "./mailTransport.types";
import { ResendMailTransport } from "./resend.transport";
import { WorkerMailerTransport } from "./workerMailer.transport";

export function createMailTransport(
  config: MailTransportConfig
): IMailTransport {
  const apiKey = config.RESEND_API_KEY?.trim();

  if (apiKey) return new ResendMailTransport(apiKey);

  const {
    SMTP_HOST: host,
    SMTP_PORT: rawPort,
    SMTP_USERNAME: username,
    SMTP_PASSWORD: password,
  } = config;

  if (!host || !rawPort || !username || !password) {
    throw new MailError(
      "No mail transport configured. Set RESEND_API_KEY or SMTP_HOST, SMTP_PORT, SMTP_USERNAME and SMTP_PASSWORD.",
      "MAIL_TRANSPORT_FAILED"
    );
  }

  const port = Number(rawPort);

  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new MailError(
      "SMTP_PORT must be a number between 1 and 65535.",
      "MAIL_TRANSPORT_FAILED"
    );
  }

  return new WorkerMailerTransport({
    host,
    port,
    secure: port === 465,
    credentials: { username, password },
  });
}
