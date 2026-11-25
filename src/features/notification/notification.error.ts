import { ServiceError } from "#/helpers/ServiceError";

export class NotificationError extends ServiceError {
  constructor(
    message: string,
    code = "NOTIFICATION_ERROR",
    statusCode = 500,
    metadata?: Record<string, unknown>
  ) {
    super(message, code, statusCode, metadata);
  }
}
