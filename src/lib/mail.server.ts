import { APP_NAME } from "#/constants";
import { createMailFactory } from "#/mail";
import { env as workerEnv } from "cloudflare:workers";

import { db } from "./db.server";
import { env } from "./env";

export const mail = createMailFactory({
  database: db,
  queue: workerEnv.EMAIL_QUEUE,
  mailConfig: {
    appName: APP_NAME,
    supportMail: env.VITE_SUPPORT_MAIL,
    systemMail: env.VITE_SYSTEM_MAIL,
  },
});
