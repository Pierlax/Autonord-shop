/**
 * Hooks API
 * 
 * GET  — List all hooks
 * POST — Emit an event (triggers matching hooks via Gateway)
 */

import { NextRequest, NextResponse } from 'next/server';
import { seedDefaultHooks, listHooks, emitEvent, KNOWN_EVENTS } from '@/lib/hooks';
import { triggerSkillAsync } from '@/lib/gateway';
import { createLogger } from '@/lib/logger';

const log = createLogger('hooks-api');

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

  seedDefaultHooks();
  return NextResponse.json({
    hooks: listHooks(),
    knownEvents: KNOWN_EVENTS,
  });
}

export async function POST(request: NextRequest) {
  if (!verifyAdmin(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    seedDefaultHooks();

    const body = await request.json() as {
      event: string;
      data: Record<string, unknown>;
      source?: string;
    };

    if (!body.event) {
      return NextResponse.json({ error: 'Missing event name' }, { status: 400 });
    }

    const result = await emitEvent(body.event, body.data || {}, body.source || 'api');

    // Trigger matched skills via Gateway
    const triggerResults = [];
    for (const hook of result.triggeredHooks) {
      const triggerResult = await triggerSkillAsync(
        hook.skillName,
        { ...body.data, _hookId: hook.hookId, _event: body.event },
        'webhook'
      );
      triggerResults.push({
        hookId: hook.hookId,
        skillName: hook.skillName,
        ...triggerResult,
      });
    }

    return NextResponse.json({
      event: result.event,
      hooksTriggered: result.triggeredHooks.length,
      results: triggerResults,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    log.error(`Hook emit error: ${errorMsg}`, error);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
