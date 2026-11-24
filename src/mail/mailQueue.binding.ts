import { createDrizzleClient } from "#/db/clients/drizzle-client";
import { logger, type LogLevel } from "#/lib/logger";

import { MailQueueProcessor } from "./consumer/mailQueue.consumer";
import { createMailTransport } from "./transport/mailTransport.factory";

export interface MailQueueBinding {
  handleBatch: (batch: MessageBatch<unknown>) => Promise<void>;
}

export function bindMailQueue(env: Env): MailQueueBinding {
  const processor = new MailQueueProcessor(
    createDrizzleClient(env.DB),
    createMailTransport(env),
    logger({
      isDev: env.ENVIRONMENT === "development",
      serviceName: "mail-queue",
      logLevel: env.LOG_LEVEL as LogLevel,
    })
  );

  return {
    handleBatch: (batch) => processor.handleBatch(batch),
  };
}
