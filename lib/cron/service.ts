/**
 * Cron Service — Dynamic Job Scheduling
 * 
 * Inspired by OpenClaw's CronService. Manages scheduled jobs dynamically
 * instead of relying on static vercel.json cron entries.
 * 
 * Architecture:
 * - Jobs are stored in-memory (with optional persistence to KV/DB)
 * - A single Vercel cron job (/api/cron/scheduler) runs every minute
 * - The scheduler checks which jobs are due and triggers them via the Gateway
 * 
 * In a future iteration, this can be backed by Upstash Redis or a database.
 */

import { createLogger } from '@/lib/logger';
import { cronDefaults } from '@/autonord.config';

const log = createLogger('cron-service');

// =============================================================================
// TYPES
// =============================================================================

export interface CronJob {
  id: string;
  name: string;
  description: string;
  /** Cron expression (5-field: minute hour day month weekday) */
  schedule: string;
  /** Which skill to execute */
  skillName: string;
  /** Payload to pass to the skill */
  payload: Record<string, unknown>;
  /** Whether the job is enabled */
  enabled: boolean;
  /** When the job was created */
  createdAt: string;
  /** When the job was last updated */
  updatedAt: string;
  /** Last execution time */
  lastRunAt?: string;
  /** Last execution status */
  lastStatus?: 'success' | 'failed' | 'skipped';
  /** Last execution error */
  lastError?: string;
  /** Last execution duration in ms */
  lastDurationMs?: number;
  /** Total number of runs */
  totalRuns: number;
  /** Total number of errors */
  totalErrors: number;
}

export interface CreateJobInput {
  name: string;
  description: string;
  schedule: string;
  skillName: string;
  payload?: Record<string, unknown>;
  enabled?: boolean;
}

export interface UpdateJobInput {
  name?: string;
  description?: string;
  schedule?: string;
  skillName?: string;
  payload?: Record<string, unknown>;
  enabled?: boolean;
}

// =============================================================================
// IN-MEMORY STORE (can be replaced with Redis/DB later)
// =============================================================================

const jobStore = new Map<string, CronJob>();

function generateId(): string {
  return `cron-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// =============================================================================
// SEED DEFAULT JOBS (from autonord.config.ts)
// =============================================================================

let seeded = false;

export function seedDefaultJobs(): void {
  if (seeded) return;

  const defaults: CreateJobInput[] = [
    {
      name: 'Blog Researcher',
      description: 'Discover trending topics and generate blog articles',
      schedule: cronDefaults.blogResearcher,
      skillName: 'blog-research',
      payload: { action: 'full-pipeline' },
    },
    {
      name: 'TAYA Director',
      description: 'Evaluate product content quality and orchestrate improvements',
      schedule: cronDefaults.tayaDirector,
      skillName: 'product-enrichment',
      payload: { action: 'quality-review' },
    },
    {
      name: 'Auto-Process Products',
      description: 'Process unenriched products in batch',
      schedule: cronDefaults.autoProcessProducts,
      skillName: 'product-enrichment',
      payload: { action: 'batch-process' },
    },
    {
      name: 'TAYA Improver',
      description: 'Weekly code and content compliance analysis',
      schedule: cronDefaults.tayaImprover,
      skillName: 'content-validation',
      payload: { action: 'weekly-audit' },
    },
  ];

  for (const job of defaults) {
    createJob(job);
  }

  seeded = true;
  log.info(`Seeded ${defaults.length} default cron jobs`);
}

// =============================================================================
// CRUD OPERATIONS
// =============================================================================

export function createJob(input: CreateJobInput): CronJob {
  const now = new Date().toISOString();
  const job: CronJob = {
    id: generateId(),
    name: input.name,
    description: input.description,
    schedule: input.schedule,
    skillName: input.skillName,
    payload: input.payload || {},
    enabled: input.enabled ?? true,
    createdAt: now,
    updatedAt: now,
    totalRuns: 0,
    totalErrors: 0,
  };

  jobStore.set(job.id, job);
  log.info(`Created cron job: "${job.name}" (${job.schedule}) → ${job.skillName}`);
  return job;
}

export function updateJob(id: string, input: UpdateJobInput): CronJob | null {
  const job = jobStore.get(id);
  if (!job) return null;

  if (input.name !== undefined) job.name = input.name;
  if (input.description !== undefined) job.description = input.description;
  if (input.schedule !== undefined) job.schedule = input.schedule;
  if (input.skillName !== undefined) job.skillName = input.skillName;
  if (input.payload !== undefined) job.payload = input.payload;
  if (input.enabled !== undefined) job.enabled = input.enabled;
  job.updatedAt = new Date().toISOString();

  log.info(`Updated cron job: "${job.name}" (${job.id})`);
  return job;
}

export function deleteJob(id: string): boolean {
  const job = jobStore.get(id);
  if (!job) return false;

  jobStore.delete(id);
  log.info(`Deleted cron job: "${job.name}" (${id})`);
  return true;
}

export function getJob(id: string): CronJob | null {
  return jobStore.get(id) || null;
}

export function listJobs(): CronJob[] {
  return Array.from(jobStore.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export function getEnabledJobs(): CronJob[] {
  return listJobs().filter((j) => j.enabled);
}

// =============================================================================
// SCHEDULING LOGIC
// =============================================================================

/**
 * Parse a 5-field cron expression and check if it matches the current time.
 * Fields: minute hour day-of-month month day-of-week
 */
function matchesCron(schedule: string, now: Date): boolean {
  const parts = schedule.split(/\s+/);
  if (parts.length !== 5) {
    log.warn(`Invalid cron expression: "${schedule}" (expected 5 fields)`);
    return false;
  }

  const [minuteExpr, hourExpr, domExpr, monthExpr, dowExpr] = parts;
  const minute = now.getMinutes();
  const hour = now.getHours();
  const dom = now.getDate();
  const month = now.getMonth() + 1; // 1-indexed
  const dow = now.getDay(); // 0 = Sunday

  return (
    matchField(minuteExpr, minute) &&
    matchField(hourExpr, hour) &&
    matchField(domExpr, dom) &&
    matchField(monthExpr, month) &&
    matchField(dowExpr, dow)
  );
}

function matchField(expr: string, value: number): boolean {
  if (expr === '*') return true;

  // Handle step values: */N
  if (expr.startsWith('*/')) {
    const step = parseInt(expr.slice(2));
    return !isNaN(step) && step > 0 && value % step === 0;
  }

  // Handle comma-separated values: 1,3,5
  if (expr.includes(',')) {
    return expr.split(',').some((v) => parseInt(v) === value);
  }

  // Handle ranges: 1-5
  if (expr.includes('-')) {
    const [start, end] = expr.split('-').map(Number);
    return value >= start && value <= end;
  }

  // Exact match
  return parseInt(expr) === value;
}

/**
 * Get all jobs that should run right now.
 */
export function getDueJobs(now?: Date): CronJob[] {
  const currentTime = now || new Date();
  return getEnabledJobs().filter((job) => matchesCron(job.schedule, currentTime));
}

/**
 * Record the result of a job execution.
 */
export function recordJobExecution(
  jobId: string,
  result: { success: boolean; durationMs: number; error?: string }
): void {
  const job = jobStore.get(jobId);
  if (!job) return;

  job.lastRunAt = new Date().toISOString();
  job.lastStatus = result.success ? 'success' : 'failed';
  job.lastDurationMs = result.durationMs;
  job.lastError = result.error;
  job.totalRuns++;
  if (!result.success) job.totalErrors++;
}
