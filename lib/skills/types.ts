/**
 * Skill System — Core Types
 * 
 * Defines the common interface for all AI skills in the Autonord platform.
 * Inspired by OpenClaw's plugin/skill architecture, adapted for our
 * e-commerce automation context.
 * 
 * Every skill MUST implement the AgentSkill interface to be registered
 * in the SkillRegistry and executable via the Gateway.
 */

// =============================================================================
// SKILL CONTEXT — Input for skill execution
// =============================================================================

export interface SkillContext {
  /** Unique execution ID for tracing */
  executionId: string;
  /** Optional product ID (for product-related skills) */
  productId?: string;
  /** Optional article slug (for blog-related skills) */
  articleSlug?: string;
  /** Arbitrary payload for skill-specific data */
  payload?: Record<string, unknown>;
  /** Who triggered this execution */
  triggeredBy: 'cron' | 'webhook' | 'manual' | 'gateway';
  /** Timestamp of when the execution was requested */
  requestedAt: string;
}

// =============================================================================
// SKILL RESULT — Output from skill execution
// =============================================================================

export type SkillStatus = 'success' | 'partial' | 'failed' | 'skipped';

export interface SkillResult {
  /** Whether the skill completed successfully */
  success: boolean;
  /** Execution status */
  status: SkillStatus;
  /** Human-readable message describing the outcome */
  message: string;
  /** Structured output data (skill-specific) */
  data?: Record<string, unknown>;
  /** Error details if failed */
  error?: string;
  /** Duration in milliseconds */
  durationMs: number;
  /** Token usage if AI was involved */
  tokenUsage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

// =============================================================================
// SKILL METADATA — Declarative description of a skill
// =============================================================================

export interface SkillMetadata {
  /** Unique skill name (kebab-case) */
  name: string;
  /** Human-readable description */
  description: string;
  /** Version string */
  version: string;
  /** Author or team */
  author: string;
  /** Categories for grouping */
  tags: string[];
  /** What triggers this skill */
  triggers: Array<'cron' | 'webhook' | 'manual' | 'pipeline'>;
  /** Estimated max duration in seconds */
  maxDurationSeconds: number;
}

// =============================================================================
// AGENT SKILL — The core interface every skill must implement
// =============================================================================

export interface AgentSkill {
  /** Skill metadata */
  metadata: SkillMetadata;

  /**
   * Execute the skill with the given context.
   * This is the main entry point for skill execution.
   */
  execute(context: SkillContext): Promise<SkillResult>;

  /**
   * Validate that the skill can run with the given context.
   * Returns null if valid, or an error message if not.
   */
  validate(context: SkillContext): Promise<string | null>;

  /**
   * Get the current status of the skill (for monitoring).
   */
  getStatus(): SkillHealthStatus;
}

// =============================================================================
// SKILL HEALTH — For monitoring and admin dashboard
// =============================================================================

export type HealthState = 'healthy' | 'degraded' | 'unhealthy' | 'unknown';

export interface SkillHealthStatus {
  state: HealthState;
  lastExecutedAt?: string;
  lastResult?: SkillStatus;
  totalExecutions: number;
  totalErrors: number;
  averageDurationMs: number;
}

// =============================================================================
// SKILL EXECUTION LOG — For persistent logging
// =============================================================================

export interface SkillExecutionLog {
  executionId: string;
  skillName: string;
  context: SkillContext;
  result: SkillResult;
  startedAt: string;
  completedAt: string;
}

// =============================================================================
// HELPER — Create a new SkillContext
// =============================================================================

export function createSkillContext(
  overrides: Partial<SkillContext> & { triggeredBy: SkillContext['triggeredBy'] }
): SkillContext {
  return {
    executionId: `exec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    requestedAt: new Date().toISOString(),
    ...overrides,
  };
}
