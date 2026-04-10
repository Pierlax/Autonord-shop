/**
 * Notifications Module — Public API
 */

export type {
  NotificationSeverity,
  NotificationChannel,
  Notification,
  SendNotificationInput,
} from './service';

export {
  sendNotification,
  notifyEnrichmentFailure,
  notifyBlogTopicDiscovery,
  notifyCronFailure,
  getNotificationHistory,
  getNotificationStats,
} from './service';
