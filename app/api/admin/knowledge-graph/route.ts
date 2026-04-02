/**
 * Admin — Knowledge Graph Base Overrides
 *
 * Manage zero-deploy additions/updates to the Knowledge Graph base knowledge.
 * Entries written here are stored in Redis (kg:v1:base) and applied on top of
 * the JSON defaults (data/kg-base.json) on every worker cold start.
 *
 * Auth: Bearer <CRON_SECRET> header OR ?secret=<CRON_SECRET> query param.
 *
 * GET  /api/admin/knowledge-graph         — list all Redis base overrides
 * POST /api/admin/knowledge-graph         — add / update an entry
 * DELETE /api/admin/knowledge-graph       — remove an entry
 *
 * POST body:
 *   { "type": "brand", "id": "ridgid", "name": "Ridgid", "properties": { "country": "USA", ... } }
 *
 * DELETE body:
 *   { "type": "brand", "id": "ridgid" }
 *
 * Valid types: brand | category | trade | use_case | battery_system | feature
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { env } from '@/lib/env';
import { getKGStore } from '@/lib/shopify/kg-store';

// =============================================================================
// AUTH
// =============================================================================

function isAuthorized(request: NextRequest): boolean {
  const secret = request.nextUrl.searchParams.get('secret');
  const authHeader = request.headers.get('authorization');
  return secret === env.CRON_SECRET || authHeader === `Bearer ${env.CRON_SECRET}`;
}

// =============================================================================
// VALIDATION
// =============================================================================

const VALID_TYPES = ['brand', 'category', 'trade', 'use_case', 'battery_system', 'feature'] as const;

const PutSchema = z.object({
  type:       z.enum(VALID_TYPES),
  id:         z.string().min(1).max(64).regex(/^[a-z0-9_]+$/, 'id must be lowercase alphanumeric with underscores'),
  name:       z.string().min(1).max(200),
  properties: z.record(z.unknown()).optional().default({}),
});

const DeleteSchema = z.object({
  type: z.enum(VALID_TYPES),
  id:   z.string().min(1).max(64),
});

// =============================================================================
// HANDLERS
// =============================================================================

/** GET — list all current Redis base overrides */
export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const store = getKGStore();

  if (!store.isEnabled()) {
    return NextResponse.json({
      ok: true,
      message: 'Redis not configured — no base overrides stored. Set UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN.',
      entries: [],
    });
  }

  const entries = await store.listBaseEntries();
  return NextResponse.json({ ok: true, count: entries.length, entries });
}

/** POST — upsert a base-knowledge entry */
export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: z.infer<typeof PutSchema>;
  try {
    body = PutSchema.parse(await request.json());
  } catch (err) {
    return NextResponse.json(
      { error: 'Invalid body', details: err instanceof Error ? err.message : String(err) },
      { status: 400 }
    );
  }

  const store = getKGStore();
  await store.putBaseEntry(body.type, body.id, body.name, body.properties);

  return NextResponse.json({
    ok: true,
    message: `Entry "${body.type}:${body.id}" saved to Redis. It will be applied on the next worker cold start.`,
    entry: { type: body.type, id: body.id, name: body.name, properties: body.properties },
  });
}

/** DELETE — remove a base-knowledge override (restores JSON default) */
export async function DELETE(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: z.infer<typeof DeleteSchema>;
  try {
    body = DeleteSchema.parse(await request.json());
  } catch (err) {
    return NextResponse.json(
      { error: 'Invalid body', details: err instanceof Error ? err.message : String(err) },
      { status: 400 }
    );
  }

  const store = getKGStore();
  await store.deleteBaseEntry(body.type, body.id);

  return NextResponse.json({
    ok: true,
    message: `Override "${body.type}:${body.id}" removed from Redis. The kg-base.json default will be restored on the next cold start.`,
  });
}
