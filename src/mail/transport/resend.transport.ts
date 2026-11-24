import { type CreateEmailOptions, Resend } from "resend";

import { MailError } from "../mail.error";
import type { IMailTransport, SendMailOption } from "./mailTransport.types";
import { buildThreadHeaders } from "./threadHeaders";

export class ResendMailTransport implements IMailTransport {
  private readonly resend: Resend;

  constructor(resendApiKey: string) {
    this.resend = new Resend(resendApiKey);
  }

  public async send(options: SendMailOption): Promise<string> {
    if (!options.html && !options.text) {
      throw new MailError(
        "Either 'html' or 'text' must be provided.",
        "MAIL_INVALID_PAYLOAD",
        400
      );
    }

    try {
      const info = await this.resend.emails.send(toCreateEmailOptions(options));

      if (!info.data) {
        throw new MailError(info.error.message, "MAIL_TRANSPORT_FAILED");
      }

      return info.data.id;
    } catch (err) {
      if (err instanceof MailError) throw err;

      throw new MailError(
        err instanceof Error ? err.message : "Unknown error occurred",
        "MAIL_TRANSPORT_FAILED"
      );
    }
  }
}

/** Convert our transport-neutral options into the Resend request shape. */
export function toCreateEmailOptions(
  options: SendMailOption
): CreateEmailOptions {
  const headers = buildThreadHeaders(options);

  return {
    from: options.from,
    to: options.to,
    subject: options.subject,
    ...(options.cc !== undefined && { cc: options.cc }),
    ...(options.bcc !== undefined && { bcc: options.bcc }),
    ...(options.replyTo !== undefined && { replyTo: options.replyTo }),
    ...(options.text !== undefined && { text: options.text }),
    ...(options.html !== undefined && { html: options.html }),
    ...(headers && { headers }),
    ...(options.attachments && { attachments: options.attachments }),
    ...(options.tags && { tags: options.tags }),
    ...(options.topicId !== undefined && { topicId: options.topicId }),
    ...(options.scheduledAt && { scheduledAt: options.scheduledAt }),
  } as CreateEmailOptions;
}
