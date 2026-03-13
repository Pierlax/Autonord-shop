import { NextRequest, NextResponse } from 'next/server';
import { env } from '@/lib/env';
import {
  redisLoadAll,
  aggregateMetricsFromArrays,
} from '@/lib/shopify/business-metrics';

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
    const [rawGenerations, rawErrors] = await Promise.all([
      redisLoadAll('metrics:generations'),
      redisLoadAll('metrics:errors'),
    ]);

    const report = aggregateMetricsFromArrays(rawGenerations, rawErrors);

    return NextResponse.json({ success: true, report });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
