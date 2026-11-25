export const ROLES = ["USER", "ADMIN", "SUPER_ADMIN"] as const;

export const PERMISSION_LEVEL = ["system", "self"] as const;
export const RESOURCE_TYPE = ["user", "role_permission", "report"] as const;
export const ACTION_TYPE = [
  "create",
  "read",
  "list",
  "update",
  "delete",
  "manage",
  "export",
] as const;

export const USER_EVENT_TYPE = [
  "auth.login",
  "auth.logout",
  "auth.login_failed",
  "auth.password_changed",
  "auth.password_reset",
  "device.new_detected",
  "admin.impersonation",
] as const;

export const EMAIL_DIRECTION = ["outbound", "inbound", "web_form"] as const;
export const EMAIL_STATUS = [
  "draft",
  "queued",
  "sent",
  "received",
  "delivered",
  "delivery_delayed",
  "bounced",
  "complained",
  "suppressed",
  "failed",
] as const;
export const EMAIL_EVENT_TYPE = [
  "email.sent",
  "email.delivered",
  "email.delivery_delayed",
  "email.bounced",
  "email.complained",
  "email.opened",
  "email.clicked",
  "email.unsubscribed",
  "email.rejected",
] as const;
export const EMAIL_RECIPIENT_TYPE = [
  "to",
  "cc",
  "bcc",
  "reply_to",
  "from",
  "received_for",
] as const;

export const NOTIFICATION_CATEGORY = ["SYSTEM", "AUTH", "SUPPORT"] as const;
export const NOTIFICATION_LEVEL = [
  "INFO",
  "SUCCESS",
  "WARNING",
  "ERROR",
] as const;
