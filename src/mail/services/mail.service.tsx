/** @jsxRuntime automatic */
import { APP_NAME } from "#/constants";
import { render, toPlainText } from "react-email";

import { MailError } from "../mail.error";
import type {
  MailConfig,
  MailServiceConfig,
  QueueMailResult,
} from "../mail.types";
import {
  type IQueueMailService,
  QueueMailService,
} from "../producer/mailQueue.producer";
import {
  AccountLockedMail,
  type AccountLockedMailProps,
  EmailVerificationMail,
  type EmailVerificationMailProps,
  NewDeviceLoginMail,
  type NewDeviceLoginMailProps,
  PasswordChangedMail,
  type PasswordChangedMailProps,
  ResetPasswordMail,
  type ResetPasswordMailProps,
  RoleChangedMail,
  type RoleChangedMailProps,
  SuspiciousLoginMail,
  type SuspiciousLoginMailProps,
  WelcomeMail,
  type WelcomeMailProps,
} from "../templates";
import type { SendMailOption } from "../transport/mailTransport.types";

/** Options for a templated mail: transport options plus the template's props. */
type MailTemplateOptions<TProps> = Omit<
  SendMailOption,
  "from" | "subject" | "text" | "html"
> &
  Omit<TProps, "appName" | "supportMail">;

export interface IMailService extends IQueueMailService {
  sendWelcomeMail: (
    options: MailTemplateOptions<WelcomeMailProps>
  ) => Promise<QueueMailResult>;

  sendEmailVerificationMail: (
    options: MailTemplateOptions<EmailVerificationMailProps>
  ) => Promise<QueueMailResult>;

  sendPasswordResetMail: (
    options: MailTemplateOptions<ResetPasswordMailProps>
  ) => Promise<QueueMailResult>;

  sendPasswordChangedMail: (
    options: MailTemplateOptions<PasswordChangedMailProps>
  ) => Promise<QueueMailResult>;

  sendNewDeviceLoginMail: (
    options: MailTemplateOptions<NewDeviceLoginMailProps>
  ) => Promise<QueueMailResult>;

  sendSuspiciousLoginMail: (
    options: MailTemplateOptions<SuspiciousLoginMailProps>
  ) => Promise<QueueMailResult>;

  sendRoleChangedMail: (
    options: MailTemplateOptions<RoleChangedMailProps>
  ) => Promise<QueueMailResult>;

  sendAccountLockedMail: (
    options: MailTemplateOptions<AccountLockedMailProps>
  ) => Promise<QueueMailResult>;
}

export class MailService extends QueueMailService implements IMailService {
  private readonly mailConfig: MailConfig;

  constructor(config: MailServiceConfig) {
    super(config);
    this.mailConfig = config.mailConfig;
  }

  public async sendMailTemplate(
    from: string,
    to: string | string[],
    subject: string,
    component: React.ReactNode,
    isSystemMail: boolean = true,
    options: Partial<Omit<SendMailOption, "from" | "to" | "subject">> = {}
  ): Promise<QueueMailResult> {
    let html: string;
    let text: string;

    try {
      html = await render(component);
      text = toPlainText(html);
    } catch (error) {
      if (error instanceof MailError) throw error;

      throw new MailError(
        error instanceof Error
          ? error.message
          : "Failed to render mail template",
        "MAIL_TEMPLATE_RENDER_FAILED",
        500,
        { subject, to }
      );
    }

    return this.sendMail(
      {
        ...options,
        from,
        to,
        subject,
        text,
        html,
      },
      isSystemMail
    );
  }

  public async sendWelcomeMail({
    to,
    ...options
  }: MailTemplateOptions<WelcomeMailProps>): Promise<QueueMailResult> {
    return this.sendMailTemplate(
      `${APP_NAME} <${this.mailConfig.systemMail}>`,
      to,
      `Welcome to ${this.mailConfig.appName}`,
      <WelcomeMail
        appName={this.mailConfig.appName}
        supportMail={this.mailConfig.supportMail}
        {...options}
      />,
      true,
      options
    );
  }

  public async sendEmailVerificationMail({
    to,
    ...options
  }: MailTemplateOptions<EmailVerificationMailProps>): Promise<QueueMailResult> {
    return this.sendMailTemplate(
      `${APP_NAME} <${this.mailConfig.systemMail}>`,
      to,
      `Verify your email for ${this.mailConfig.appName}`,
      <EmailVerificationMail
        appName={this.mailConfig.appName}
        supportMail={this.mailConfig.supportMail}
        {...options}
      />,
      true,
      options
    );
  }

  public async sendPasswordResetMail({
    to,
    ...options
  }: MailTemplateOptions<ResetPasswordMailProps>): Promise<QueueMailResult> {
    return this.sendMailTemplate(
      `${APP_NAME} <${this.mailConfig.systemMail}>`,
      to,
      `Reset your password for ${this.mailConfig.appName}`,
      <ResetPasswordMail
        appName={this.mailConfig.appName}
        supportMail={this.mailConfig.supportMail}
        {...options}
      />,
      true,
      options
    );
  }

  public async sendPasswordChangedMail({
    to,
    ...options
  }: MailTemplateOptions<PasswordChangedMailProps>): Promise<QueueMailResult> {
    return this.sendMailTemplate(
      `${APP_NAME} <${this.mailConfig.systemMail}>`,
      to,
      `Password changed for ${this.mailConfig.appName}`,
      <PasswordChangedMail
        appName={this.mailConfig.appName}
        supportMail={this.mailConfig.supportMail}
        {...options}
      />,
      true,
      options
    );
  }

  public async sendNewDeviceLoginMail({
    to,

    ...options
  }: MailTemplateOptions<NewDeviceLoginMailProps>): Promise<QueueMailResult> {
    return this.sendMailTemplate(
      `${APP_NAME} <${this.mailConfig.systemMail}>`,
      to,
      `New device login detected for ${this.mailConfig.appName}`,
      <NewDeviceLoginMail
        appName={this.mailConfig.appName}
        supportMail={this.mailConfig.supportMail}
        {...options}
      />,
      true,
      options
    );
  }

  public async sendSuspiciousLoginMail({
    to,
    ...options
  }: MailTemplateOptions<SuspiciousLoginMailProps>): Promise<QueueMailResult> {
    return this.sendMailTemplate(
      `${APP_NAME} <${this.mailConfig.systemMail}>`,
      to,
      `Suspicious login detected for your ${this.mailConfig.appName} account`,
      <SuspiciousLoginMail
        appName={this.mailConfig.appName}
        supportMail={this.mailConfig.supportMail}
        {...options}
      />,
      true,
      options
    );
  }

  public async sendRoleChangedMail({
    to,
    ...options
  }: MailTemplateOptions<RoleChangedMailProps>): Promise<QueueMailResult> {
    return this.sendMailTemplate(
      `${APP_NAME} <${this.mailConfig.systemMail}>`,
      to,
      `Your role has been changed for ${this.mailConfig.appName}`,
      <RoleChangedMail
        appName={this.mailConfig.appName}
        supportMail={this.mailConfig.supportMail}
        {...options}
      />,
      true,
      options
    );
  }

  public async sendAccountLockedMail({
    to,
    ...options
  }: MailTemplateOptions<AccountLockedMailProps>): Promise<QueueMailResult> {
    return this.sendMailTemplate(
      `${APP_NAME} <${this.mailConfig.systemMail}>`,
      to,
      `Your ${this.mailConfig.appName} account has been locked`,
      <AccountLockedMail
        appName={this.mailConfig.appName}
        supportMail={this.mailConfig.supportMail}
        {...options}
      />,
      true,
      options
    );
  }
}
