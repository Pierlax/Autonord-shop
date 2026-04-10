/**
 * Pipeline Metrics Endpoint — W-OBS-3
 *
 * Exposes aggregated pipeline run metrics for external scraping.
 *
 * GET /api/admin/metrics/pipeline
 *   → Prometheus text format (default) for Grafana/Prometheus scraping
 *
 * GET /api/admin/metrics/pipeline?format=json
 *   → JSON summary for dashboard integration
 *
 * GET /api/admin/metrics/pipeline?format=records&limit=50
 *   → Raw records (last N) for debugging
 *
 * Auth: requires CRON_SECRET bearer token (same as workers).
 */

import { NextRequest, NextResponse } from 'next/server';
import { exportPrometheusText, getMetricsSummary, getRecords } from '@/lib/metrics-store';

function isAuthorized(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  const auth = request.headers.get('authorization');
  return auth === `Bearer ${cronSecret}`;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const format = searchParams.get('format') ?? 'prometheus';

  if (format === 'json') {
    const windowMinutes = parseInt(searchParams.get('window') ?? '60', 10);
    const summary = getMetricsSummary(windowMinutes);
    return NextResponse.json(summary);
  }

  if (format === 'records') {
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '50', 10), 500);
    const records = getRecords(limit);
    return NextResponse.json({ count: records.length, records });
  }

  // Default: Prometheus text format
  const prometheusText = exportPrometheusText();
  return new NextResponse(prometheusText, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}
