import { NextRequest, NextResponse } from 'next/server';
import { env } from '@/lib/env';
import {
  redisLoadAll,
  aggregateMetricsFromArrays,
} from '@/lib/shopify/business-metrics';
import { checkBudget } from '@/lib/shopify/ai-budget';
import { getCacheStats } from '@/lib/shopify/rag-cache';
import { getModelConfig } from '@/lib/shopify/ai-client';

function isAuthorized(request: NextRequest): boolean {
  const secret = request.nextUrl.searchParams.get('secret');
  const authHeader = request.headers.get('authorization');
  return secret === env.CRON_SECRET || authHeader === `Bearer ${env.CRON_SECRET}`;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const [rawGenerations, rawErrors, budget, cacheStats] = await Promise.all([
      redisLoadAll('metrics:generations'),
      redisLoadAll('metrics:errors'),
      checkBudget(),
      getCacheStats(),
    ]);

    const report = aggregateMetricsFromArrays(rawGenerations, rawErrors);
    const modelConfig = getModelConfig();

    return NextResponse.json({
      success: true,
      report,
      ai: {
        model: modelConfig,
        budget: {
          daily: budget.daily,
          monthlyCostUSD: parseFloat(budget.monthlyCostUSD.toFixed(4)),
          dailyLimitUSD: budget.dailyLimitUSD,
          monthlyLimitUSD: budget.monthlyLimitUSD,
          dailyPercent: parseFloat(budget.dailyPercent.toFixed(1)),
          monthlyPercent: parseFloat(budget.monthlyPercent.toFixed(1)),
          warning: budget.warning,
        },
      },
      cache: cacheStats,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
