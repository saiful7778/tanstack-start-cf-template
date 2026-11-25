/** @jsxRuntime automatic */
import { Text } from "react-email";

import { EmailHeading, EmailInfoCard, EmailLayout } from "../../components";

export interface NotificationMailProps {
  userName: string;
  appName: string;
  supportMail: string;
  /** The notification's title, used as the headline. */
  title: string;
  /** The notification body. */
  message: string;
  /** Human-readable category, e.g. "System". */
  category: string;
  /** Human-readable severity, e.g. "Warning". */
  level: string;
}

/**
 * A single notification delivered by email.
 *
 * One generic template on purpose: the notification row already carries the
 * copy, so per-event templates would just duplicate it and drift.
 */
export default function NotificationMail({
  userName,
  appName,
  supportMail,
  title,
  message,
  category,
  level,
}: NotificationMailProps) {
  return (
    <EmailLayout
      appName={appName}
      previewText={title}
      supportMail={supportMail}
    >
      <EmailHeading>{title}</EmailHeading>
      <Text>Hello {userName},</Text>
      <Text>{message}</Text>

      <EmailInfoCard>
        <Text className="mb-0 text-xs text-muted-foreground">
          {category} · {level}
        </Text>
      </EmailInfoCard>

      <Text className="text-sm text-muted-foreground">
        You are receiving this because email notifications are enabled for this
        category. You can change that at any time in your notification settings.
      </Text>
    </EmailLayout>
  );
}

NotificationMail.PreviewProps = {
  userName: "John Doe",
  appName: "App name",
  supportMail: "help@app-name.com",
  title: "Your export is ready",
  message:
    "The report you requested has finished generating and is ready to download.",
  category: "System",
  level: "Info",
};
