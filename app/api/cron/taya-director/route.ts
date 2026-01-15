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
import { runDirector, DEFAULT_CONFIG, DirectorConfig } from '@/lib/taya-director';

// Vercel cron jobs have a 60-second timeout on Hobby plan
// Director should complete within this time
export const maxDuration = 60;

/**
 * Verify the request is from Vercel Cron or authorized source
 */
function verifyRequest(request: NextRequest): boolean {
  // Check for Vercel Cron header
  const authHeader = request.headers.get('authorization');
  if (authHeader === `Bearer ${process.env.CRON_SECRET}`) {
    return true;
  }

  // Check for Vercel internal cron
  const vercelCron = request.headers.get('x-vercel-cron');
  if (vercelCron) {
    return true;
  }

  // Allow in development
  if (process.env.NODE_ENV === 'development') {
    return true;
  }

  // Allow manual trigger with QStash signature
  const qstashSignature = request.headers.get('upstash-signature');
  if (qstashSignature) {
    return true;
  }

  return false;
}

/**
 * GET handler for cron job
 */
export async function GET(request: NextRequest) {
  console.log('🎭 TAYA Director cron triggered');

  // Verify request
  if (!verifyRequest(request)) {
    console.warn('Unauthorized cron request');
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  // Check required environment variables
  const requiredEnvVars = [
    'ANTHROPIC_API_KEY',
    'SHOPIFY_SHOP_DOMAIN',
    'SHOPIFY_ADMIN_ACCESS_TOKEN',
  ];

  const missingVars = requiredEnvVars.filter(v => !process.env[v]);
  if (missingVars.length > 0) {
    console.error(`Missing environment variables: ${missingVars.join(', ')}`);
    return NextResponse.json(
      { 
        error: 'Configuration error',
        missing: missingVars,
      },
      { status: 500 }
    );
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
    console.error('TAYA Director cron error:', error);
    
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
  console.log('🎭 TAYA Director manually triggered');

  // Verify request
  if (!verifyRequest(request)) {
    console.warn('Unauthorized manual trigger');
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  // Parse optional config overrides from body
  let configOverrides: Partial<DirectorConfig> = {};
  try {
    const body = await request.json();
    configOverrides = body.config || {};
  } catch {
    // No body or invalid JSON, use defaults
  }

  // Check required environment variables
  const requiredEnvVars = [
    'ANTHROPIC_API_KEY',
    'SHOPIFY_SHOP_DOMAIN',
    'SHOPIFY_ADMIN_ACCESS_TOKEN',
  ];

  const missingVars = requiredEnvVars.filter(v => !process.env[v]);
  if (missingVars.length > 0) {
    console.error(`Missing environment variables: ${missingVars.join(', ')}`);
    return NextResponse.json(
      { 
        error: 'Configuration error',
        missing: missingVars,
      },
      { status: 500 }
    );
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
    console.error('TAYA Director manual trigger error:', error);
    
    return NextResponse.json(
      { 
        error: 'Director execution failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
