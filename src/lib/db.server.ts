import { createDrizzleClient } from "#/db/clients/drizzle-client";
import { env as workerEnv } from "cloudflare:workers";

export const db = createDrizzleClient(workerEnv.DB);
