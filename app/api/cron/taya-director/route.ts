/**
 * TAYA Director - Cron Endpoint
 * 
 * Runs nightly to:
 * 1. Evaluate AI-enhanced product content quality
 * 2. Identify content gaps and plan editorial calendar
 * 3. Queue re-enrichment for low-quality products
 * 4. Commission new blog articles
 * 
 * Trigger: Vercel Cron (configured in vercel.json)
 * Schedule: Every night at 2:00 AM CET
 */

import { NextRequest, NextResponse } from 'next/server';
import { loggers } from '@/lib/logger';
import { env, optionalEnv } from '@/lib/env';

const log = loggers.taya;
import { runDirector, DEFAULT_CONFIG, DirectorConfig } from '@/lib/taya-director';

// Vercel cron jobs have a 60-second timeout on Hobby plan
// Director should complete within this time
export const maxDuration = 60;

function isAuthorized(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  const querySecret = request.nextUrl.searchParams.get('secret');
  // Allow in development
  if (optionalEnv.NODE_ENV === 'development') { console.warn('[Security] Dev bypass active — auth skipped (NODE_ENV=development)'); return true; }
  return authHeader === `Bearer ${env.CRON_SECRET}` || querySecret === env.CRON_SECRET;
}

/**
 * GET handler for cron job
 */
export async function GET(request: NextRequest) {
  log.info('🎭 TAYA Director cron triggered');

  if (!isAuthorized(request)) {
    log.warn('Unauthorized cron request');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Run the director with default config
    const config: DirectorConfig = {
      ...DEFAULT_CONFIG,
      // Disable code improver for cron (run manually)
      modules: {
        ...DEFAULT_CONFIG.modules,
        codeImprover: false,
      },
    };

    const session = await runDirector(config);

    // Return summary
    return NextResponse.json({
      success: true,
      sessionId: session.sessionId,
      summary: {
        productsEvaluated: session.productsEvaluated,
        productsPassed: session.productsPassed,
        productsFailed: session.productsFailed,
        articlesCommissioned: session.articlesCommissioned,
        decisionsCount: session.decisions.length,
        errorsCount: session.errors.length,
      },
      completedAt: session.completedAt,
    });

  } catch (error) {
    log.error('TAYA Director cron error:', error);
    
    return NextResponse.json(
      { 
        error: 'Director execution failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * POST handler for manual/QStash triggers
 */
export async function POST(request: NextRequest) {
  log.info('🎭 TAYA Director manually triggered');

  if (!isAuthorized(request)) {
    log.warn('Unauthorized manual trigger');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Parse optional config overrides from body
  let configOverrides: Partial<DirectorConfig> = {};
  try {
    const body = await request.json();
    configOverrides = body.config || {};
  } catch {
    // No body or invalid JSON, use defaults
  }

  try {
    // Merge config
    const config: DirectorConfig = {
      ...DEFAULT_CONFIG,
      ...configOverrides,
      modules: {
        ...DEFAULT_CONFIG.modules,
        ...(configOverrides.modules || {}),
      },
    };

    const session = await runDirector(config);

    return NextResponse.json({
      success: true,
      sessionId: session.sessionId,
      summary: {
        productsEvaluated: session.productsEvaluated,
        productsPassed: session.productsPassed,
        productsFailed: session.productsFailed,
        articlesCommissioned: session.articlesCommissioned,
        decisionsCount: session.decisions.length,
        errorsCount: session.errors.length,
      },
      decisions: session.decisions.map(d => ({
        id: d.id,
        type: d.action.type,
        status: d.status,
        priority: d.priority,
      })),
      errors: session.errors,
      completedAt: session.completedAt,
    });

  } catch (error) {
    log.error('TAYA Director manual trigger error:', error);
    
    return NextResponse.json(
      { 
        error: 'Director execution failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
