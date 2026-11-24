import {
  type EmailOptions,
  type WorkerMailerOptions,
  WorkerMailer,
} from "worker-mailer";

import { MailError } from "../mail.error";
import type {
  IMailTransport,
  MailAttachment,
  SendMailOption,
} from "./mailTransport.types";
import { buildThreadHeaders } from "./threadHeaders";

type SendableEmailOptions = SendMailOption & {
  from: string;
  subject: string;
};

export class WorkerMailerTransport implements IMailTransport {
  constructor(private readonly config: WorkerMailerOptions) {}

  public async send(options: SendMailOption): Promise<string> {
    if (!options.html && !options.text) {
      throw new MailError(
        "Either 'html' or 'text' must be provided.",
        "MAIL_INVALID_PAYLOAD",
        400
      );
    }

    if (!isSendable(options)) {
      throw new MailError(
        "Both 'from' and 'subject' must be provided.",
        "MAIL_INVALID_PAYLOAD",
        400
      );
    }

    let mailer: WorkerMailer;

    try {
      mailer = await WorkerMailer.connect(this.config);
    } catch (err) {
      throw asMailError(err);
    }

    try {
      await mailer.send(toEmailOptions(options));

      return crypto.randomUUID();
    } catch (err) {
      throw asMailError(err);
    } finally {
      await mailer.close();
    }
  }
}

function isSendable(options: SendMailOption): options is SendableEmailOptions {
  return Boolean(options.from && options.subject);
}

function asMailError(err: unknown): MailError {
  if (err instanceof MailError) return err;

  return new MailError(
    err instanceof Error ? err.message : "Unknown error occurred",
    "MAIL_TRANSPORT_FAILED"
  );
}

function toEmailOptions(options: SendableEmailOptions): EmailOptions {
  const email: EmailOptions = {
    from: options.from,
    to: options.to,
    subject: options.subject,
  };

  if (options.html !== undefined) email.html = options.html;
  if (options.text !== undefined) email.text = options.text;
  if (options.cc !== undefined) email.cc = options.cc;
  if (options.bcc !== undefined) email.bcc = options.bcc;

  const reply = Array.isArray(options.replyTo)
    ? options.replyTo.join(", ")
    : options.replyTo;

  if (reply !== undefined) email.reply = reply;

  const headers = buildThreadHeaders(options);
  if (headers) email.headers = headers;

  const attachments = options.attachments?.flatMap(toSmtpAttachment);
  if (attachments?.length) email.attachments = attachments;

  return email;
}

/**
 * SMTP needs inline base64 content. Attachments that only carry a hosted
 * `path` cannot be fetched here, so they are skipped.
 */
function toSmtpAttachment(attachment: MailAttachment) {
  if (!attachment.filename || attachment.content == null) return [];

  return [
    {
      filename: attachment.filename,
      content:
        typeof attachment.content === "string"
          ? attachment.content
          : toBase64(attachment.content),
      ...(attachment.contentType && { mimeType: attachment.contentType }),
    },
  ];
}

function toBase64(content: Uint8Array | ArrayBuffer): string {
  const bytes =
    content instanceof Uint8Array ? content : new Uint8Array(content);
  let binary = "";

  for (const byte of bytes) binary += String.fromCharCode(byte);

  return btoa(binary);
}
