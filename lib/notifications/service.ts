/**
 * Notification Service — Proactive Alerting System
 * 
 * Sends notifications to admins when important events occur:
 * - Enrichment failures
 * - Blog topic discoveries
 * - Cron job failures
 * - System errors
 * 
 * Channels:
 * - Email (via Resend API or SMTP)
 * - Console/Log (always, as fallback)
 * - WhatsApp (future, via Twilio or direct API)
 * 
 * Inspired by OpenClaw's WhatsApp extension pattern.
 */

import { createLogger } from '@/lib/logger';
import { notifications as notifConfig } from '@/autonord.config';

const log = createLogger('notifications');

// =============================================================================
// TYPES
// =============================================================================

export type NotificationSeverity = 'info' | 'warning' | 'critical';
export type NotificationChannel = 'email' | 'console' | 'whatsapp';

export interface Notification {
  id: string;
  title: string;
  message: string;
  severity: NotificationSeverity;
  channel: NotificationChannel;
  metadata?: Record<string, unknown>;
  sentAt: string;
  success: boolean;
  error?: string;
}

export interface SendNotificationInput {
  title: string;
  message: string;
  severity?: NotificationSeverity;
  channel?: NotificationChannel;
  metadata?: Record<string, unknown>;
}

// =============================================================================
// NOTIFICATION HISTORY
// =============================================================================

const notificationHistory: Notification[] = [];
const MAX_HISTORY = 200;

function generateId(): string {
  return `notif-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function recordNotification(notif: Notification): void {
  notificationHistory.unshift(notif);
  if (notificationHistory.length > MAX_HISTORY) {
    notificationHistory.length = MAX_HISTORY;
  }
}

// =============================================================================
// CHANNEL: CONSOLE (always available)
// =============================================================================

function sendConsoleNotification(title: string, message: string, severity: NotificationSeverity): void {
  const severityEmoji: Record<NotificationSeverity, string> = {
    info: 'ℹ️',
    warning: '⚠️',
    critical: '🚨',
  };
  const prefix = `[NOTIFICATION ${severityEmoji[severity]}]`;
  
  switch (severity) {
    case 'critical':
      log.error(`${prefix} ${title}: ${message}`);
      break;
    case 'warning':
      log.warn(`${prefix} ${title}: ${message}`);
      break;
    default:
      log.info(`${prefix} ${title}: ${message}`);
  }
}

// =============================================================================
// CHANNEL: EMAIL (via Resend or fetch-based SMTP)
// =============================================================================

async function sendEmailNotification(
  title: string,
  message: string,
  severity: NotificationSeverity,
  metadata?: Record<string, unknown>
): Promise<{ success: boolean; error?: string }> {
  const resendApiKey = process.env.RESEND_API_KEY;

  if (!resendApiKey) {
    log.warn('RESEND_API_KEY not set — email notification skipped');
    return { success: false, error: 'RESEND_API_KEY not configured' };
  }

  try {
    const severityLabel = severity.toUpperCase();
    const metadataHtml = metadata
      ? `<pre style="background:#f5f5f5;padding:12px;border-radius:4px;font-size:12px;">${JSON.stringify(metadata, null, 2)}</pre>`
      : '';

    const html = `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
        <div style="background:${severity === 'critical' ? '#dc2626' : severity === 'warning' ? '#f59e0b' : '#3b82f6'};color:white;padding:16px 24px;border-radius:8px 8px 0 0;">
          <h2 style="margin:0;">[${severityLabel}] ${title}</h2>
        </div>
        <div style="padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;">
          <p style="color:#374151;line-height:1.6;">${message}</p>
          ${metadataHtml}
          <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0;">
          <p style="color:#9ca3af;font-size:12px;">Autonord AI Platform — Automated Notification</p>
        </div>
      </div>
    `;

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: 'Autonord AI <notifications@autonordservice.com>',
        to: [notifConfig.adminEmail],
        subject: `[${severityLabel}] ${title}`,
        html,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { success: false, error: `Resend API error: ${response.status} ${errorText}` };
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

// =============================================================================
// MAIN SEND FUNCTION
// =============================================================================

/**
 * Send a notification through the specified channel.
 */
export async function sendNotification(input: SendNotificationInput): Promise<Notification> {
  const severity = input.severity || 'info';
  const channel = input.channel || 'console';
  const id = generateId();

  // Always log to console
  sendConsoleNotification(input.title, input.message, severity);

  let success = true;
  let error: string | undefined;

  // Send via the specified channel
  if (channel === 'email') {
    const result = await sendEmailNotification(input.title, input.message, severity, input.metadata);
    success = result.success;
    error = result.error;
  }

  const notification: Notification = {
    id,
    title: input.title,
    message: input.message,
    severity,
    channel,
    metadata: input.metadata,
    sentAt: new Date().toISOString(),
    success,
    error,
  };

  recordNotification(notification);
  return notification;
}

// =============================================================================
// CONVENIENCE METHODS
// =============================================================================

/**
 * Notify about enrichment failure.
 */
export async function notifyEnrichmentFailure(
  productTitle: string,
  error: string,
  productId?: string
): Promise<Notification> {
  if (!notifConfig.notifyOnEnrichmentFailure) {
    return sendNotification({
      title: `Enrichment Failed: ${productTitle}`,
      message: error,
      severity: 'info',
      channel: 'console',
    });
  }

  return sendNotification({
    title: `Enrichment Failed: ${productTitle}`,
    message: `The product enrichment pipeline failed for "${productTitle}". Error: ${error}`,
    severity: 'critical',
    channel: 'email',
    metadata: { productId, productTitle, error },
  });
}

/**
 * Notify about blog topic discovery.
 */
export async function notifyBlogTopicDiscovery(
  topicCount: number,
  topTopics: string[]
): Promise<Notification> {
  if (!notifConfig.notifyOnBlogTopicDiscovery) {
    return sendNotification({
      title: `Blog Topics Discovered`,
      message: `Found ${topicCount} topics`,
      severity: 'info',
      channel: 'console',
    });
  }

  return sendNotification({
    title: `Blog: ${topicCount} New Topics Discovered`,
    message: `The blog researcher found ${topicCount} trending topics. Top picks: ${topTopics.join(', ')}`,
    severity: 'info',
    channel: 'email',
    metadata: { topicCount, topTopics },
  });
}

/**
 * Notify about cron job failure.
 */
export async function notifyCronFailure(
  jobName: string,
  error: string
): Promise<Notification> {
  if (!notifConfig.notifyOnCronFailure) {
    return sendNotification({
      title: `Cron Failed: ${jobName}`,
      message: error,
      severity: 'info',
      channel: 'console',
    });
  }

  return sendNotification({
    title: `Cron Job Failed: ${jobName}`,
    message: `The scheduled job "${jobName}" failed with error: ${error}`,
    severity: 'warning',
    channel: 'email',
    metadata: { jobName, error },
  });
}

// =============================================================================
// HISTORY ACCESS
// =============================================================================

/**
 * Get recent notification history.
 */
export function getNotificationHistory(options?: {
  severity?: NotificationSeverity;
  channel?: NotificationChannel;
  limit?: number;
}): Notification[] {
  let history = [...notificationHistory];

  if (options?.severity) {
    history = history.filter((n) => n.severity === options.severity);
  }
  if (options?.channel) {
    history = history.filter((n) => n.channel === options.channel);
  }

  return history.slice(0, options?.limit ?? 50);
}

/**
 * Get notification statistics.
 */
export function getNotificationStats(): {
  total: number;
  bySeverity: Record<NotificationSeverity, number>;
  byChannel: Record<string, number>;
  failedCount: number;
} {
  const bySeverity: Record<NotificationSeverity, number> = { info: 0, warning: 0, critical: 0 };
  const byChannel: Record<string, number> = {};
  let failedCount = 0;

  for (const notif of notificationHistory) {
    bySeverity[notif.severity]++;
    byChannel[notif.channel] = (byChannel[notif.channel] || 0) + 1;
    if (!notif.success) failedCount++;
  }

  return {
    total: notificationHistory.length,
    bySeverity,
    byChannel,
    failedCount,
  };
}
