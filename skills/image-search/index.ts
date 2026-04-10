/**
 * Image Search Skill
 * 
 * Wraps the ImageAgent V4 to find product images from trusted retailers
 * and manufacturer websites. Prioritizes high-quality, properly licensed images.
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
import { findProductImage, type ImageAgentV4Result } from '@/lib/agents/image-agent-v4';

const log = createLogger('skill:image-search');

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
  name: 'image-search',
  description: 'Finds product images from trusted retailers and manufacturer websites. Prioritizes high-quality images with proper ALT text for SEO.',
  version: '1.0.0',
  author: 'Autonord Team',
  tags: ['image', 'search', 'media', 'seo'],
  triggers: ['pipeline', 'manual'],
  maxDurationSeconds: 60,
};

// =============================================================================
// PAYLOAD TYPE
// =============================================================================

interface ImageSearchPayload {
  title: string;
  vendor: string;
  sku: string | null;
  barcode: string | null;
}

// =============================================================================
// SKILL IMPLEMENTATION
// =============================================================================

async function execute(context: SkillContext): Promise<SkillResult> {
  const startMs = Date.now();
  totalExecutions++;

  try {
    const payload = context.payload as unknown as ImageSearchPayload;

    log.info(`Searching image for "${payload.title}" [${context.executionId}]`, {
      vendor: payload.vendor,
      sku: payload.sku,
    });

    const imageResult: ImageAgentV4Result = await findProductImage(
      payload.title,
      payload.vendor,
      payload.sku,
      payload.barcode
    );

    const durationMs = Date.now() - startMs;
    totalDurationMs += durationMs;
    lastExecutedAt = new Date().toISOString();

    if (imageResult.success) {
      lastResult = 'success';
      return {
        success: true,
        status: 'success',
        message: `Image found via ${imageResult.method} from ${imageResult.source}`,
        data: {
          imageUrl: imageResult.imageUrl,
          imageAlt: imageResult.imageAlt,
          source: imageResult.source,
          method: imageResult.method,
          searchAttempts: imageResult.searchAttempts,
        },
        durationMs,
      };
    } else {
      lastResult = 'partial';
      return {
        success: false,
        status: 'partial',
        message: `No image found after ${imageResult.searchAttempts} attempts`,
        data: {
          error: imageResult.error,
          searchAttempts: imageResult.searchAttempts,
        },
        durationMs,
      };
    }
  } catch (error) {
    totalErrors++;
    lastResult = 'failed';
    const durationMs = Date.now() - startMs;
    totalDurationMs += durationMs;

    const errorMsg = error instanceof Error ? error.message : String(error);
    log.error(`Image search failed [${context.executionId}]: ${errorMsg}`, error);

    return {
      success: false,
      status: 'failed',
      message: 'Image search failed',
      error: errorMsg,
      durationMs,
    };
  }
}

async function validate(context: SkillContext): Promise<string | null> {
  if (!context.payload) {
    return 'Payload is required with product info (title, vendor, sku, barcode)';
  }
  const payload = context.payload as Record<string, unknown>;
  if (!payload.title || typeof payload.title !== 'string') {
    return 'Payload must include a "title" string field';
  }
  if (!payload.vendor || typeof payload.vendor !== 'string') {
    return 'Payload must include a "vendor" string field';
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

export const imageSearchSkill: AgentSkill = {
  metadata,
  execute,
  validate,
  getStatus,
};
