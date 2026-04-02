/**
 * Notifications API
 * 
 * GET  — Get notification history and stats
 * POST — Send a test notification
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  sendNotification,
  getNotificationHistory,
  getNotificationStats,
} from '@/lib/notifications';
import { createLogger } from '@/lib/logger';

const log = createLogger('notifications-api');

function verifyAdmin(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) return true;
  if (process.env.NODE_ENV === 'development') return true;
  return false;
}

export async function GET(request: NextRequest) {
  if (!verifyAdmin(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const severity = searchParams.get('severity') as any;
  const limit = parseInt(searchParams.get('limit') || '50');

  return NextResponse.json({
    history: getNotificationHistory({ severity, limit }),
    stats: getNotificationStats(),
  });
}

export async function POST(request: NextRequest) {
  if (!verifyAdmin(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();

    if (!body.title || !body.message) {
      return NextResponse.json(
        { error: 'Missing required fields: title, message' },
        { status: 400 }
      );
    }

    const notification = await sendNotification({
      title: body.title,
      message: body.message,
      severity: body.severity || 'info',
      channel: body.channel || 'console',
      metadata: body.metadata,
    });

    return NextResponse.json({ notification });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
