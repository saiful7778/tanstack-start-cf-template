import {
  createServerEntry,
  createStartHandler,
  defaultStreamHandler,
} from "@tanstack/react-start/server";

import { queueLog } from "./lib/logger.server";
import { bindMailQueue } from "./mail";

export { NotificationDurableObject } from "./features/notification/server/notification.do";

const startHandler = createStartHandler(defaultStreamHandler);

const serverEntry = createServerEntry({
  async fetch(request, opts) {
    return await startHandler(request, opts);
  },
});

export default {
  fetch(request) {
    return serverEntry.fetch(request);
  },
  async queue(batch, env): Promise<void> {
    switch (batch.queue) {
      case "mail-queue": {
        await bindMailQueue(env).handleBatch(batch);
        break;
      }

      default:
        queueLog.warn({ queue: batch.queue }, "queue.unknown");
        break;
    }
  },
} satisfies ExportedHandler<Env>;
