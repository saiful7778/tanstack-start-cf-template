import type { MailServiceConfig } from "./mail.types";
import { MailService, type IMailService } from "./services/mail.service";

export function createMailFactory(config: MailServiceConfig): IMailService {
  return new MailService(config);
}
