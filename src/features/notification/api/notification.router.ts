import {
  listNotificationProcedure,
  markAllAsReadProcedure,
  markAsReadProcedure,
  notificationImpl,
  settingsDetailsProcedure,
  subscribePushNotificationProcedure,
  unreadCountProcedure,
  unsubscribePushNotificationProcedure,
  updateSettingsProcedure,
} from "./notification.procedure";

export const notificationRouter = notificationImpl.router({
  list: listNotificationProcedure,
  unreadCount: unreadCountProcedure,
  settings: settingsDetailsProcedure,
  markAsRead: markAsReadProcedure,
  markAllAsRead: markAllAsReadProcedure,
  updateSettings: updateSettingsProcedure,
  subscribe: subscribePushNotificationProcedure,
  unsubscribe: unsubscribePushNotificationProcedure,
});
