/**
 * Memory Maintenance Cron Job
 *
 * Esegue pulizia, decay e consolidamento della memoria AgeMem.
 * Suggerito: 1 volta a settimana (es. domenica alle 03:00).
 *
 * Configurare in vercel.json:
 *   { "path": "/api/cron/memory-maintenance", "schedule": "0 3 * * 0" }
 */

import { NextRequest, NextResponse } from 'next/server';
import { loggers } from '@/lib/logger';
import { runFullMaintenance, getMemoryHealthReport } from '@/lib/agent-memory';

const log = loggers.memory;

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function verifyCronRequest(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (process.env.NODE_ENV === 'development') return true;
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) return true;

  const { searchParams } = new URL(request.url);
  const secret = searchParams.get('secret');
  if (cronSecret && secret === cronSecret) return true;

  return request.headers.get('x-vercel-cron') === '1';
}

export async function GET(request: NextRequest) {
  if (!verifyCronRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startTime = Date.now();
  log.info('[MemoryMaintenance] Starting maintenance job...');

  try {
    // Stato prima della manutenzione
    const healthBefore = getMemoryHealthReport();
    log.info(`[MemoryMaintenance] Health before: ${healthBefore.totalMemories} entries, score ${healthBefore.healthScore}`);

    // Esegui manutenzione completa (cleanup expired + decay + consolidamento)
    const report = runFullMaintenance();

    // Stato dopo
    const healthAfter = getMemoryHealthReport();
    log.info(`[MemoryMaintenance] Health after: ${healthAfter.totalMemories} entries, score ${healthAfter.healthScore}`);
    log.info(`[MemoryMaintenance] Done in ${Date.now() - startTime}ms`);

    return NextResponse.json({
      success: true,
      report,
      health: {
        before: { total: healthBefore.totalMemories, score: healthBefore.healthScore },
        after: { total: healthAfter.totalMemories, score: healthAfter.healthScore },
      },
      processingTime: `${Date.now() - startTime}ms`,
    });
  } catch (error) {
    log.error('[MemoryMaintenance] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTime: `${Date.now() - startTime}ms`,
      },
      { status: 500 }
    );
  }
}

// Permette trigger manuale via POST
export async function POST(request: NextRequest) {
  return GET(request);
}
