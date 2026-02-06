/**
 * Universal Cron Scheduler
 * 
 * This is the ONLY cron endpoint needed in vercel.json.
 * It runs every minute and checks the CronService for due jobs,
 * then triggers them via the Gateway.
 * 
 * Replaces all individual cron routes with a single dynamic scheduler.
 */

import { NextRequest, NextResponse } from 'next/server';
import { seedDefaultJobs, getDueJobs, recordJobExecution } from '@/lib/cron';
import { triggerSkillAsync } from '@/lib/gateway';
import { createLogger } from '@/lib/logger';

const log = createLogger('cron-scheduler');

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Ensure default jobs are seeded
    seedDefaultJobs();

    const now = new Date();
    const dueJobs = getDueJobs(now);

    if (dueJobs.length === 0) {
      return NextResponse.json({
        message: 'No jobs due',
        time: now.toISOString(),
      });
    }

    log.info(`Scheduler: ${dueJobs.length} jobs due at ${now.toISOString()}`);

    const results = [];

    for (const job of dueJobs) {
      const startMs = Date.now();

      try {
        log.info(`Triggering job "${job.name}" → skill "${job.skillName}"`);

        const queueResult = await triggerSkillAsync(
          job.skillName,
          { ...job.payload, _cronJobId: job.id, _cronJobName: job.name },
          'cron'
        );

        const durationMs = Date.now() - startMs;

        recordJobExecution(job.id, {
          success: !queueResult.error,
          durationMs,
          error: queueResult.error,
        });

        results.push({
          jobId: job.id,
          jobName: job.name,
          skillName: job.skillName,
          queued: queueResult.queued,
          executionId: queueResult.executionId,
          error: queueResult.error,
        });
      } catch (error) {
        const durationMs = Date.now() - startMs;
        const errorMsg = error instanceof Error ? error.message : String(error);

        recordJobExecution(job.id, {
          success: false,
          durationMs,
          error: errorMsg,
        });

        log.error(`Failed to trigger job "${job.name}": ${errorMsg}`, error);

        results.push({
          jobId: job.id,
          jobName: job.name,
          skillName: job.skillName,
          queued: false,
          error: errorMsg,
        });
      }
    }

    return NextResponse.json({
      message: `Processed ${dueJobs.length} jobs`,
      time: now.toISOString(),
      results,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    log.error(`Scheduler error: ${errorMsg}`, error);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
