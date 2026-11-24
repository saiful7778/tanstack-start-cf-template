import { ServiceError } from "#/helpers/ServiceError";

export class MailError extends ServiceError {
  constructor(
    message: string,
    code: MailErrorCode,
    statusCode: number = 500,
    metadata?: Record<string, unknown>
  ) {
    super(message, code, statusCode, metadata);
  }
}

export type MailErrorCode =
  | "MAIL_INVALID_PAYLOAD"
  | "MAIL_RATE_LIMITED"
  | "MAIL_DUPLICATE_SUPPRESSED"
  | "MAIL_TRANSPORT_FAILED"
  | "MAIL_BAD_REQUEST"
  | "MAIL_RECIPIENT_INVALID"
  | "MAIL_EMAIL_NOT_FOUND"
  | "MAIL_THREAD_NOT_FOUND"
  | "MAIL_THREAD_CREATE_FAILED"
  | "MAIL_PERSISTENCE_FAILED"
  | "MAIL_TEMPLATE_RENDER_FAILED"
  | "MAIL_WEBHOOK_UNAUTHORIZED";
