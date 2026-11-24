import {
  createServerEntry,
  createStartHandler,
  defaultStreamHandler,
} from "@tanstack/react-start/server";

import { bindMailQueue } from "./mail";

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
        console.warn("Unknown queue:", batch.queue);
        break;
    }
  },
} satisfies ExportedHandler<Env>;
