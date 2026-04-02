/**
 * Cron: Process Retry Queue + Dead Letter Queue
 *
 * Runs every 5 minutes. Drains two Redis queues:
 *
 *   1. retry:enrichment:v1  — L2 fallback jobs (QStash was down at enqueue time)
 *      → always attempt re-queue via QStash; remove on success
 *
 *   2. queue:dead-letter     — jobs that exhausted QStash retries and were explicitly
 *      moved here by the worker.  Only replayed if retryCount < MAX_RETRIES.
 *      Jobs at or above MAX_RETRIES are left in the DLQ for manual review.
 *
 * Protected by CRON_SECRET.
 */

import { NextRequest, NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { peekRetryQueue, removeFromRetryQueue, queueProductEnrichment, EnrichmentJob } from '@/lib/queue';
import {
  peekDeadLetterQueue,
  removeFromDeadLetter,
  deadLetterQueueLength,
  MAX_RETRIES,
} from '@/lib/queue/dead-letter';

export const maxDuration = 60;

function isAuthorized(request: NextRequest): boolean {
  const secret = request.nextUrl.searchParams.get('secret');
  const authHeader = request.headers.get('authorization');
  return secret === env.CRON_SECRET || authHeader === `Bearer ${env.CRON_SECRET}`;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const baseUrl = new URL(request.url).origin;

  // ──────────────────────────────────────────────────────────────────────────
  // PASS 1: retry:enrichment:v1 (L2 fallback — QStash was unavailable)
  // ──────────────────────────────────────────────────────────────────────────
  let retryProcessed = 0;
  let retryFailed = 0;
  let retrySkipped = false;

  try {
    const retryJobs = await peekRetryQueue(20);

    if (retryJobs === null) {
      retrySkipped = true;
    } else {
      for (const job of retryJobs) {
        const result = await queueProductEnrichment(job, baseUrl);
        if (result.queued && result.via === 'qstash') {
          await removeFromRetryQueue(job);
          retryProcessed++;
        } else {
          retryFailed++;
        }
      }
    }
  } catch {
    retrySkipped = true;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // PASS 2: queue:dead-letter (exhausted retries — replay if still eligible)
  // ──────────────────────────────────────────────────────────────────────────
  let dlqReplayed = 0;
  let dlqExhausted = 0;
  let dlqFailed = 0;
  let dlqSkipped = false;
  let dlqLength: number | null = null;

  try {
    const dlqEntries = await peekDeadLetterQueue(10);

    if (dlqEntries === null) {
      dlqSkipped = true;
    } else {
      dlqLength = await deadLetterQueueLength();

      for (const entry of dlqEntries) {
        // Jobs at or above the retry ceiling stay in DLQ for manual review
        if (entry.retryCount >= MAX_RETRIES) {
          dlqExhausted++;
          continue;
        }

        // Payload must be a valid EnrichmentJob to re-queue
        const payload = entry.payload as EnrichmentJob;
        if (!payload?.productId) {
          // Non-enrichment job — leave for manual inspection
          dlqExhausted++;
          continue;
        }

        const result = await queueProductEnrichment(
          { ...payload, receivedAt: new Date().toISOString() },
          baseUrl,
        );

        if (result.queued && result.via === 'qstash') {
          await removeFromDeadLetter(entry);
          dlqReplayed++;
        } else {
          dlqFailed++;
        }
      }
    }
  } catch {
    dlqSkipped = true;
  }

  return NextResponse.json({
    retryQueue: retrySkipped
      ? { skipped: true, reason: 'Redis not configured' }
      : { processed: retryProcessed, failed: retryFailed },
    deadLetterQueue: dlqSkipped
      ? { skipped: true, reason: 'Redis not configured' }
      : {
          replayed: dlqReplayed,
          exhausted: dlqExhausted,
          failed: dlqFailed,
          totalInQueue: dlqLength,
          maxRetries: MAX_RETRIES,
        },
  });
}
