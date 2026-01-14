/**
 * Blog Researcher - Notification System
 * Sends alerts via email or Slack when new articles are drafted
 */

import { ArticleDraft } from './drafting';

interface NotificationResult {
  success: boolean;
  channel: 'email' | 'slack' | 'none';
  message?: string;
  error?: string;
}

/**
 * Send notification via Slack webhook
 */
async function sendSlackNotification(
  article: ArticleDraft,
  articleUrl: string
): Promise<NotificationResult> {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  
  if (!webhookUrl) {
    return { success: false, channel: 'slack', error: 'SLACK_WEBHOOK_URL not configured' };
  }

  const message = {
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '📝 Nuova Bozza Articolo Blog',
          emoji: true,
        },
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Titolo:*\n${article.title}`,
          },
          {
            type: 'mrkdwn',
            text: `*Categoria:*\n${article.category}`,
          },
        ],
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Anteprima:*\n${article.excerpt}`,
        },
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Tempo di lettura:*\n${article.estimatedReadTime} min`,
          },
          {
            type: 'mrkdwn',
            text: `*Tags:*\n${article.tags.join(', ')}`,
          },
        ],
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: '✏️ Revisiona su Shopify',
              emoji: true,
            },
            url: articleUrl,
            style: 'primary',
          },
        ],
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `🤖 Generato automaticamente da Blog Researcher Agent | ${new Date().toLocaleString('it-IT')}`,
          },
        ],
      },
    ],
  };

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    });

    if (!response.ok) {
      throw new Error(`Slack webhook failed: ${response.status}`);
    }

    console.log('[Notification] Slack notification sent successfully');
    return { success: true, channel: 'slack', message: 'Notification sent to Slack' };
  } catch (error) {
    console.error('[Notification] Slack error:', error);
    return { 
      success: false, 
      channel: 'slack', 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

/**
 * Send notification via email (using a simple webhook service like Resend or SendGrid)
 */
async function sendEmailNotification(
  article: ArticleDraft,
  articleUrl: string
): Promise<NotificationResult> {
  const emailTo = process.env.NOTIFICATION_EMAIL;
  const resendApiKey = process.env.RESEND_API_KEY;
  
  if (!emailTo) {
    return { success: false, channel: 'email', error: 'NOTIFICATION_EMAIL not configured' };
  }
  
  if (!resendApiKey) {
    return { success: false, channel: 'email', error: 'RESEND_API_KEY not configured' };
  }

  const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #1a1a2e; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
    .content { background: #f9f9f9; padding: 20px; border: 1px solid #ddd; }
    .footer { background: #eee; padding: 15px; border-radius: 0 0 8px 8px; font-size: 12px; }
    .button { display: inline-block; background: #e63946; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; margin-top: 15px; }
    .meta { color: #666; font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📝 Nuova Bozza Articolo</h1>
    </div>
    <div class="content">
      <h2>${article.title}</h2>
      <p class="meta"><strong>Categoria:</strong> ${article.category} | <strong>Tempo di lettura:</strong> ${article.estimatedReadTime} min</p>
      <p><strong>Anteprima:</strong></p>
      <p>${article.excerpt}</p>
      <p><strong>Tags:</strong> ${article.tags.join(', ')}</p>
      <a href="${articleUrl}" class="button">✏️ Revisiona su Shopify</a>
    </div>
    <div class="footer">
      <p>🤖 Questo articolo è stato generato automaticamente dal Blog Researcher Agent di Autonord.</p>
      <p>Generato il: ${new Date().toLocaleString('it-IT')}</p>
    </div>
  </div>
</body>
</html>
  `;

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: 'Blog Researcher <noreply@autonordservice.com>',
        to: emailTo,
        subject: `📝 Nuova Bozza: ${article.title}`,
        html: emailHtml,
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(`Resend API failed: ${errorData}`);
    }

    console.log('[Notification] Email notification sent successfully');
    return { success: true, channel: 'email', message: `Email sent to ${emailTo}` };
  } catch (error) {
    console.error('[Notification] Email error:', error);
    return { 
      success: false, 
      channel: 'email', 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

/**
 * Send notification through all configured channels
 */
export async function sendNotification(
  article: ArticleDraft,
  shopifyArticleId: number
): Promise<NotificationResult[]> {
  const shopDomain = process.env.SHOPIFY_SHOP_DOMAIN || 'your-store.myshopify.com';
  const articleUrl = `https://${shopDomain}/admin/articles/${shopifyArticleId}`;
  
  console.log(`[Notification] Sending notifications for article: ${article.title}`);
  
  const results: NotificationResult[] = [];
  
  // Try Slack first
  const slackResult = await sendSlackNotification(article, articleUrl);
  results.push(slackResult);
  
  // Then try email
  const emailResult = await sendEmailNotification(article, articleUrl);
  results.push(emailResult);
  
  // Log summary
  const successCount = results.filter(r => r.success).length;
  console.log(`[Notification] Sent ${successCount}/${results.length} notifications`);
  
  return results;
}

/**
 * Send a simple test notification
 */
export async function sendTestNotification(): Promise<NotificationResult[]> {
  const testArticle: ArticleDraft = {
    title: 'Test: Blog Researcher Agent Attivo',
    slug: 'test-blog-researcher',
    metaDescription: 'Questo è un test del sistema di notifiche.',
    content: '<p>Test content</p>',
    excerpt: 'Questo è un messaggio di test per verificare che il sistema di notifiche funzioni correttamente.',
    tags: ['test', 'sistema'],
    category: 'Test',
    estimatedReadTime: 1,
  };
  
  return sendNotification(testArticle, 0);
}
