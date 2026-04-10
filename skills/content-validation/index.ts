/**
 * Content Validation Skill
 * 
 * Wraps the TAYA Police module to validate AI-generated content
 * against the TAYA philosophy rules (no marketing fluff, honest pros/cons, etc.).
 * 
 * Triggers: pipeline (called by product-enrichment), manual
 */

import { createLogger } from '@/lib/logger';
import type {
  AgentSkill,
  SkillContext,
  SkillResult,
  SkillMetadata,
  SkillHealthStatus,
} from '@/lib/skills/types';
import {
  validateAndCorrect,
  type ContentToValidate,
  type CleanedContent,
  type Violation,
} from '@/lib/agents/taya-police';

const log = createLogger('skill:content-validation');

// =============================================================================
// HEALTH TRACKING
// =============================================================================

let totalExecutions = 0;
let totalErrors = 0;
let totalDurationMs = 0;
let lastExecutedAt: string | undefined;
let lastResult: SkillResult['status'] | undefined;

// =============================================================================
// METADATA
// =============================================================================

const metadata: SkillMetadata = {
  name: 'content-validation',
  description: 'Validates AI-generated product content against TAYA philosophy rules. Scans for banned marketing phrases and triggers AI correction when violations are found.',
  version: '1.0.0',
  author: 'Autonord Team',
  tags: ['validation', 'taya', 'quality', 'content'],
  triggers: ['pipeline', 'manual'],
  maxDurationSeconds: 30,
};

// =============================================================================
// SKILL IMPLEMENTATION
// =============================================================================

async function execute(context: SkillContext): Promise<SkillResult> {
  const startMs = Date.now();
  totalExecutions++;

  try {
    const content = context.payload as unknown as ContentToValidate;

    if (!content || !content.description) {
      return {
        success: false,
        status: 'failed',
        message: 'Missing content to validate (requires description, pros, cons, faqs)',
        error: 'Invalid payload: missing description field',
        durationMs: Date.now() - startMs,
      };
    }

    log.info(`Validating content [${context.executionId}]`, {
      descriptionLength: content.description.length,
      prosCount: content.pros?.length ?? 0,
      consCount: content.cons?.length ?? 0,
    });

    const result = await validateAndCorrect(content);

    const durationMs = Date.now() - startMs;
    totalDurationMs += durationMs;
    lastExecutedAt = new Date().toISOString();
    lastResult = 'success';

    return {
      success: true,
      status: 'success',
      message: result.wasFixed
        ? `Fixed ${result.violations.length} TAYA violations`
        : 'Content passed TAYA validation',
      data: {
        wasFixed: result.wasFixed,
        violationCount: result.violations.length,
        violations: result.violations,
        cleanedContent: result.content,
      },
      durationMs,
    };
  } catch (error) {
    totalErrors++;
    lastResult = 'failed';
    const durationMs = Date.now() - startMs;
    totalDurationMs += durationMs;

    const errorMsg = error instanceof Error ? error.message : String(error);
    log.error(`Content validation failed [${context.executionId}]: ${errorMsg}`, error);

    return {
      success: false,
      status: 'failed',
      message: 'Content validation failed',
      error: errorMsg,
      durationMs,
    };
  }
}

async function validate(context: SkillContext): Promise<string | null> {
  if (!context.payload) {
    return 'Payload is required with content to validate';
  }
  const content = context.payload as Record<string, unknown>;
  if (!content.description || typeof content.description !== 'string') {
    return 'Payload must include a "description" string field';
  }
  return null;
}

function getStatus(): SkillHealthStatus {
  return {
    state: totalErrors > totalExecutions * 0.5 ? 'degraded' : 'healthy',
    lastExecutedAt,
    lastResult,
    totalExecutions,
    totalErrors,
    averageDurationMs: totalExecutions > 0 ? Math.round(totalDurationMs / totalExecutions) : 0,
  };
}

// =============================================================================
// EXPORT
// =============================================================================

export const contentValidationSkill: AgentSkill = {
  metadata,
  execute,
  validate,
  getStatus,
};
