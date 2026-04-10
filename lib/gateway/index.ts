/**
 * Gateway — Conceptual Control Plane
 * 
 * Inspired by OpenClaw's Gateway pattern. Provides a single entry point
 * for triggering skills, monitoring task status, and accessing logs.
 * 
 * In a serverless context (Vercel), this is not a persistent WebSocket server
 * but rather a set of functions that orchestrate skill execution via QStash
 * and provide observability through the SkillRegistry and Logger.
 */

import { createLogger } from '@/lib/logger';
import {
  loadAllSkills,
  executeSkill,
  listSkills,
  getSkillsHealth,
  getExecutionLogs,
  getExecutionStats,
  getSkill,
  type SkillContext,
  type SkillResult,
  type SkillMetadata,
  type SkillHealthStatus,
  type SkillExecutionLog,
  createSkillContext,
} from '@/lib/skills';
import { getRecentLogs, getLogStats, type LogEntry } from '@/lib/logger';

const log = createLogger('gateway');

// Ensure skills are loaded
let initialized = false;

function ensureInitialized(): void {
  if (!initialized) {
    loadAllSkills();
    initialized = true;
  }
}

// =============================================================================
// SKILL EXECUTION
// =============================================================================

/**
 * Trigger a skill execution directly (synchronous, for workers).
 */
export async function triggerSkill(
  skillName: string,
  payload: Record<string, unknown>,
  triggeredBy: SkillContext['triggeredBy'] = 'gateway'
): Promise<SkillResult> {
  ensureInitialized();

  const context = createSkillContext({
    triggeredBy,
    payload,
    productId: payload.productId as string | undefined,
    articleSlug: payload.articleSlug as string | undefined,
  });

  log.info(`Triggering skill "${skillName}" [${context.executionId}]`, {
    triggeredBy,
    hasPayload: !!payload,
  });

  return executeSkill(skillName, context);
}

/**
 * Trigger a skill execution via QStash (asynchronous, for webhooks/admin).
 */
export async function triggerSkillAsync(
  skillName: string,
  payload: Record<string, unknown>,
  triggeredBy: SkillContext['triggeredBy'] = 'gateway'
): Promise<{ queued: boolean; executionId: string; error?: string }> {
  ensureInitialized();

  const context = createSkillContext({
    triggeredBy,
    payload,
    productId: payload.productId as string | undefined,
  });

  try {
    // Dynamic import to avoid build-time errors
    const { Client } = await import('@upstash/qstash');
    const token = process.env.QSTASH_TOKEN;

    if (!token) {
      // Fallback to synchronous execution
      log.warn('QSTASH_TOKEN not set, executing skill synchronously');
      const result = await executeSkill(skillName, context);
      return { queued: false, executionId: context.executionId };
    }

    const client = new Client({ token });
    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : process.env.NEXT_PUBLIC_BASE_URL || 'https://autonord-shop.vercel.app';

    await client.publishJSON({
      url: `${baseUrl}/api/gateway/execute`,
      body: { skillName, context },
      retries: 3,
    });

    log.info(`Skill "${skillName}" queued via QStash [${context.executionId}]`);
    return { queued: true, executionId: context.executionId };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    log.error(`Failed to queue skill "${skillName}": ${errorMsg}`, error);
    return { queued: false, executionId: context.executionId, error: errorMsg };
  }
}

// =============================================================================
// OBSERVABILITY
// =============================================================================

/**
 * Get a full dashboard snapshot.
 */
export function getDashboardData(): {
  skills: SkillMetadata[];
  health: Record<string, SkillHealthStatus>;
  executionStats: ReturnType<typeof getExecutionStats>;
  recentExecutions: SkillExecutionLog[];
  recentLogs: LogEntry[];
  logStats: ReturnType<typeof getLogStats>;
} {
  ensureInitialized();

  return {
    skills: listSkills(),
    health: getSkillsHealth(),
    executionStats: getExecutionStats(),
    recentExecutions: getExecutionLogs({ limit: 20 }),
    recentLogs: getRecentLogs({ limit: 50 }),
    logStats: getLogStats(),
  };
}

/**
 * Get skill-specific details.
 */
export function getSkillDetails(skillName: string): {
  metadata: SkillMetadata;
  health: SkillHealthStatus;
  recentExecutions: SkillExecutionLog[];
  recentLogs: LogEntry[];
} | null {
  ensureInitialized();

  const skill = getSkill(skillName);
  if (!skill) return null;

  return {
    metadata: skill.metadata,
    health: skill.getStatus(),
    recentExecutions: getExecutionLogs({ skillName, limit: 20 }),
    recentLogs: getRecentLogs({ service: `skill:${skillName}`, limit: 50 }),
  };
}

// =============================================================================
// RE-EXPORTS for convenience
// =============================================================================

export { listSkills, getSkillsHealth, getExecutionLogs, getExecutionStats };
