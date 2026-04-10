/**
 * Hook Service — Generalized Webhook System
 * 
 * Inspired by OpenClaw's hook system. Provides a pub/sub mechanism
 * where events can trigger one or more skill executions.
 * 
 * Events:
 * - product.created → triggers product-enrichment
 * - product.updated → triggers product-enrichment (if not already enriched)
 * - blog.topic_discovered → triggers blog-research
 * - enrichment.completed → triggers notifications
 * - enrichment.failed → triggers notifications
 */

import { createLogger } from '@/lib/logger';

const log = createLogger('hook-service');

// =============================================================================
// TYPES
// =============================================================================

export interface HookDefinition {
  id: string;
  /** Event name (e.g., 'product.created') */
  event: string;
  /** Description of this hook */
  description: string;
  /** Skill to trigger when event fires */
  skillName: string;
  /** Static payload to merge with event data */
  staticPayload?: Record<string, unknown>;
  /** Whether the hook is enabled */
  enabled: boolean;
  /** Priority (lower = first) */
  priority: number;
  /** Created timestamp */
  createdAt: string;
}

export interface HookEvent {
  name: string;
  data: Record<string, unknown>;
  timestamp: string;
  source: string;
}

export type HookHandler = (event: HookEvent) => Promise<void>;

// =============================================================================
// STORE
// =============================================================================

const hooks = new Map<string, HookDefinition>();
const eventHandlers = new Map<string, HookHandler[]>();
let initialized = false;

function generateId(): string {
  return `hook-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// =============================================================================
// SEED DEFAULT HOOKS
// =============================================================================

export function seedDefaultHooks(): void {
  if (initialized) return;

  const defaults: Omit<HookDefinition, 'id' | 'createdAt'>[] = [
    {
      event: 'product.created',
      description: 'Enrich new products automatically',
      skillName: 'product-enrichment',
      enabled: true,
      priority: 10,
    },
    {
      event: 'product.updated',
      description: 'Re-enrich products when updated (if not already enriched)',
      skillName: 'product-enrichment',
      staticPayload: { checkExisting: true },
      enabled: true,
      priority: 10,
    },
    {
      event: 'enrichment.completed',
      description: 'Notify admin when enrichment completes',
      skillName: 'notification-sender',
      staticPayload: { type: 'enrichment-success' },
      enabled: false, // Enable when notification skill is ready
      priority: 50,
    },
    {
      event: 'enrichment.failed',
      description: 'Alert admin when enrichment fails',
      skillName: 'notification-sender',
      staticPayload: { type: 'enrichment-failure', severity: 'high' },
      enabled: false,
      priority: 50,
    },
  ];

  for (const hook of defaults) {
    registerHook(hook);
  }

  initialized = true;
  log.info(`Seeded ${defaults.length} default hooks`);
}

// =============================================================================
// CRUD
// =============================================================================

export function registerHook(
  input: Omit<HookDefinition, 'id' | 'createdAt'>
): HookDefinition {
  const hook: HookDefinition = {
    ...input,
    id: generateId(),
    createdAt: new Date().toISOString(),
  };

  hooks.set(hook.id, hook);
  log.info(`Hook registered: "${hook.event}" → ${hook.skillName}`);
  return hook;
}

export function unregisterHook(id: string): boolean {
  const removed = hooks.delete(id);
  if (removed) log.info(`Hook unregistered: ${id}`);
  return removed;
}

export function listHooks(): HookDefinition[] {
  return Array.from(hooks.values()).sort((a, b) => a.priority - b.priority);
}

export function getHooksForEvent(event: string): HookDefinition[] {
  return listHooks().filter((h) => h.enabled && h.event === event);
}

// =============================================================================
// EVENT EMISSION
// =============================================================================

/**
 * Emit an event and return the list of hooks that were triggered.
 * The actual skill execution is delegated to the Gateway.
 */
export async function emitEvent(
  eventName: string,
  data: Record<string, unknown>,
  source: string = 'system'
): Promise<{
  event: string;
  triggeredHooks: Array<{ hookId: string; skillName: string }>;
}> {
  const matchingHooks = getHooksForEvent(eventName);

  log.info(`Event "${eventName}" emitted from "${source}": ${matchingHooks.length} hooks matched`);

  const event: HookEvent = {
    name: eventName,
    data,
    timestamp: new Date().toISOString(),
    source,
  };

  const triggeredHooks: Array<{ hookId: string; skillName: string }> = [];

  // Call registered programmatic handlers
  const handlers = eventHandlers.get(eventName) || [];
  for (const handler of handlers) {
    try {
      await handler(event);
    } catch (error) {
      log.error(`Hook handler error for "${eventName}": ${error}`);
    }
  }

  // Return hook definitions for the Gateway to trigger
  for (const hook of matchingHooks) {
    triggeredHooks.push({
      hookId: hook.id,
      skillName: hook.skillName,
    });
  }

  return { event: eventName, triggeredHooks };
}

/**
 * Register a programmatic event handler (for internal use).
 */
export function onEvent(eventName: string, handler: HookHandler): void {
  const existing = eventHandlers.get(eventName) || [];
  existing.push(handler);
  eventHandlers.set(eventName, existing);
}

// =============================================================================
// KNOWN EVENTS
// =============================================================================

export const KNOWN_EVENTS = [
  'product.created',
  'product.updated',
  'product.deleted',
  'enrichment.started',
  'enrichment.completed',
  'enrichment.failed',
  'blog.topic_discovered',
  'blog.article_generated',
  'blog.article_published',
  'validation.violations_found',
  'image.found',
  'image.not_found',
  'cron.job_completed',
  'cron.job_failed',
  'system.error',
  'system.health_check',
] as const;

export type KnownEvent = typeof KNOWN_EVENTS[number];
