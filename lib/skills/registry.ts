/**
 * Skill Registry — Central registry for all AI skills
 * 
 * Provides a single point to register, discover, and execute skills.
 * All skills must be registered here to be accessible via the Gateway
 * and the Admin Dashboard.
 */

import { createLogger } from '@/lib/logger';
import type {
  AgentSkill,
  SkillContext,
  SkillResult,
  SkillExecutionLog,
  SkillMetadata,
  SkillHealthStatus,
} from './types';

const log = createLogger('skill-registry');

// =============================================================================
// REGISTRY STATE
// =============================================================================

const skills = new Map<string, AgentSkill>();
const executionLogs: SkillExecutionLog[] = [];
const MAX_LOG_ENTRIES = 500;

// =============================================================================
// REGISTRATION
// =============================================================================

/**
 * Register a skill in the registry.
 * Throws if a skill with the same name is already registered.
 */
export function registerSkill(skill: AgentSkill): void {
  const name = skill.metadata.name;

  if (skills.has(name)) {
    log.warn(`Skill "${name}" is already registered — overwriting`);
  }

  skills.set(name, skill);
  log.info(`Skill registered: "${name}" v${skill.metadata.version}`);
}

/**
 * Unregister a skill by name.
 */
export function unregisterSkill(name: string): boolean {
  const removed = skills.delete(name);
  if (removed) {
    log.info(`Skill unregistered: "${name}"`);
  }
  return removed;
}

// =============================================================================
// DISCOVERY
// =============================================================================

/**
 * Get a skill by name.
 */
export function getSkill(name: string): AgentSkill | undefined {
  return skills.get(name);
}

/**
 * List all registered skills.
 */
export function listSkills(): SkillMetadata[] {
  return Array.from(skills.values()).map((s) => s.metadata);
}

/**
 * List all registered skill names.
 */
export function listSkillNames(): string[] {
  return Array.from(skills.keys());
}

/**
 * Get the health status of all skills.
 */
export function getSkillsHealth(): Record<string, SkillHealthStatus> {
  const health: Record<string, SkillHealthStatus> = {};
  for (const [name, skill] of skills) {
    health[name] = skill.getStatus();
  }
  return health;
}

// =============================================================================
// EXECUTION
// =============================================================================

/**
 * Execute a skill by name with the given context.
 * Handles validation, execution, logging, and error handling.
 */
export async function executeSkill(
  skillName: string,
  context: SkillContext
): Promise<SkillResult> {
  const skill = skills.get(skillName);

  if (!skill) {
    const errorMsg = `Skill "${skillName}" not found in registry. Available: ${listSkillNames().join(', ')}`;
    log.error(errorMsg);
    return {
      success: false,
      status: 'failed',
      message: errorMsg,
      error: errorMsg,
      durationMs: 0,
    };
  }

  const startedAt = new Date().toISOString();
  const startMs = Date.now();

  // Validate
  const validationError = await skill.validate(context);
  if (validationError) {
    const result: SkillResult = {
      success: false,
      status: 'failed',
      message: `Validation failed: ${validationError}`,
      error: validationError,
      durationMs: Date.now() - startMs,
    };
    recordExecution(skillName, context, result, startedAt);
    return result;
  }

  // Execute
  try {
    log.info(`Executing skill "${skillName}" [${context.executionId}]`, {
      triggeredBy: context.triggeredBy,
      productId: context.productId,
    });

    const result = await skill.execute(context);
    const completedAt = new Date().toISOString();

    recordExecution(skillName, context, result, startedAt);

    log.info(`Skill "${skillName}" completed [${context.executionId}]: ${result.status}`, {
      durationMs: result.durationMs,
      status: result.status,
    });

    return result;
  } catch (error) {
    const durationMs = Date.now() - startMs;
    const errorMsg = error instanceof Error ? error.message : String(error);

    const result: SkillResult = {
      success: false,
      status: 'failed',
      message: `Skill "${skillName}" threw an unhandled error`,
      error: errorMsg,
      durationMs,
    };

    recordExecution(skillName, context, result, startedAt);

    log.error(`Skill "${skillName}" failed [${context.executionId}]: ${errorMsg}`, error);

    return result;
  }
}

// =============================================================================
// EXECUTION LOGS
// =============================================================================

function recordExecution(
  skillName: string,
  context: SkillContext,
  result: SkillResult,
  startedAt: string
): void {
  const entry: SkillExecutionLog = {
    executionId: context.executionId,
    skillName,
    context,
    result,
    startedAt,
    completedAt: new Date().toISOString(),
  };

  executionLogs.unshift(entry);

  // Keep log size bounded
  if (executionLogs.length > MAX_LOG_ENTRIES) {
    executionLogs.length = MAX_LOG_ENTRIES;
  }
}

/**
 * Get recent execution logs, optionally filtered by skill name.
 */
export function getExecutionLogs(options?: {
  skillName?: string;
  limit?: number;
  status?: SkillResult['status'];
}): SkillExecutionLog[] {
  let logs = [...executionLogs];

  if (options?.skillName) {
    logs = logs.filter((l) => l.skillName === options.skillName);
  }

  if (options?.status) {
    logs = logs.filter((l) => l.result.status === options.status);
  }

  const limit = options?.limit ?? 50;
  return logs.slice(0, limit);
}

/**
 * Get a single execution log by ID.
 */
export function getExecutionLog(executionId: string): SkillExecutionLog | undefined {
  return executionLogs.find((l) => l.executionId === executionId);
}

/**
 * Get execution statistics.
 */
export function getExecutionStats(): {
  total: number;
  bySkill: Record<string, { total: number; success: number; failed: number }>;
  recentErrors: SkillExecutionLog[];
} {
  const bySkill: Record<string, { total: number; success: number; failed: number }> = {};

  for (const entry of executionLogs) {
    if (!bySkill[entry.skillName]) {
      bySkill[entry.skillName] = { total: 0, success: 0, failed: 0 };
    }
    bySkill[entry.skillName].total++;
    if (entry.result.success) {
      bySkill[entry.skillName].success++;
    } else {
      bySkill[entry.skillName].failed++;
    }
  }

  const recentErrors = executionLogs
    .filter((l) => l.result.status === 'failed')
    .slice(0, 10);

  return {
    total: executionLogs.length,
    bySkill,
    recentErrors,
  };
}
