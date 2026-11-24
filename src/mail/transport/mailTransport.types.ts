/**
 * Attachment accepted by every transport.
 *
 * `content` may be a base64 string or raw bytes; the Resend transport forwards
 * it as-is (the SDK base64-encodes bytes), while the SMTP transport converts
 * bytes to base64 itself. `path` is only honoured by Resend — worker-mailer has
 * no way to fetch a remote file, so it skips path-only attachments.
 */
export interface MailAttachment {
  filename?: string | false | undefined;
  content?: string | Uint8Array | ArrayBuffer | undefined;
  contentType?: string | undefined;
  contentId?: string | undefined;
  path?: string | undefined;
}

/**
 * Options for sending a single mail through any transport.
 *
 * `tags`, `topicId` and `scheduledAt` are Resend-only extras: they are persisted
 * with the email record and forwarded when Resend sends it, and ignored over
 * SMTP.
 */
export interface SendMailOption {
  from: string;
  to: string | string[];
  cc?: string | string[] | undefined;
  bcc?: string | string[] | undefined;
  replyTo?: string | string[] | undefined;
  subject: string;
  text?: string | undefined;
  html?: string | undefined;
  headers?: Record<string, string> | undefined;
  attachments?: MailAttachment[] | undefined;

  /** Resend-only. */
  tags?: Array<{ name: string; value: string }> | undefined;
  topicId?: string | null | undefined;
  scheduledAt?: string | undefined;

  /** Local thread this mail belongs to. Never sent to a provider. */
  threadId?: string | undefined;
  /** Threading: sent as the `In-Reply-To` header. */
  inReplyTo?: string | undefined;
  /** Threading: sent as the `References` header. */
  references?: string[] | undefined;
}

/** Implemented by every mail transport. Returns the provider message id. */
export interface IMailTransport {
  send: (options: SendMailOption) => Promise<string>;
}

/** Environment variables a transport can be built from. */
export interface MailTransportConfig {
  RESEND_API_KEY?: string;
  SMTP_HOST?: string;
  SMTP_PORT?: string;
  SMTP_USERNAME?: string;
  SMTP_PASSWORD?: string;
}
