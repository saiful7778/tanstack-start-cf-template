import type { QueueMailServiceConfig } from "./producer/mailQueue.producer";

export interface MailConfig {
  appName: string;
  systemMail: string;
  supportMail: string;
}

export interface MailServiceConfig extends QueueMailServiceConfig {
  mailConfig: MailConfig;
}

export interface QueueMailResult {
  success: boolean;
  emailId?: string;
  threadId?: string;
  error?: string;
}
