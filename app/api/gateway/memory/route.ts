/**
 * Memory API
 * 
 * GET    — Search or list memories
 * POST   — Store a new memory
 * DELETE — Delete a memory
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  storeMemory,
  searchMemory,
  listMemories,
  deleteMemory,
  getMemoryStats,
  type StoreInput,
  type MemoryNamespace,
} from '@/lib/memory';
import { createLogger } from '@/lib/logger';

const log = createLogger('memory-api');

function verifyAdmin(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) return true;
  if (process.env.NODE_ENV === 'development') return true;
  return false;
}

export async function GET(request: NextRequest) {
  if (!verifyAdmin(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');
  const namespace = searchParams.get('namespace') as MemoryNamespace | null;
  const statsOnly = searchParams.get('stats') === 'true';

  if (statsOnly) {
    return NextResponse.json({ stats: getMemoryStats() });
  }

  if (query) {
    const results = searchMemory({
      query,
      namespace: namespace || undefined,
      limit: parseInt(searchParams.get('limit') || '10'),
    });
    return NextResponse.json({ results });
  }

  const memories = listMemories(namespace || undefined);
  return NextResponse.json({
    memories: memories.slice(0, 100),
    total: memories.length,
    stats: getMemoryStats(),
  });
}

export async function POST(request: NextRequest) {
  if (!verifyAdmin(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json() as StoreInput;

    if (!body.content || !body.namespace) {
      return NextResponse.json(
        { error: 'Missing required fields: content, namespace' },
        { status: 400 }
      );
    }

    const entry = storeMemory(body);
    log.info(`Memory stored via API: [${entry.namespace}] ${entry.id}`);
    return NextResponse.json({ entry }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  if (!verifyAdmin(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: 'Missing memory id' }, { status: 400 });
  }

  const deleted = deleteMemory(id);
  if (!deleted) {
    return NextResponse.json({ error: 'Memory not found' }, { status: 404 });
  }

  return NextResponse.json({ deleted: true });
}
