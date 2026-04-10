/**
 * Admin API — AgeMem CRUD
 *
 * GET    /api/admin/memory          → lista/ricerca memorie
 * POST   /api/admin/memory          → aggiunge una nuova memoria
 * PUT    /api/admin/memory          → aggiorna una memoria esistente
 * DELETE /api/admin/memory?id=xxx   → elimina una memoria
 *
 * Protetto da CRON_SECRET (Bearer token) o query param ?secret=
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  addMemory,
  updateMemory,
  deleteMemory,
  searchMemory,
  getAllMemories,
  getMemoryStats,
  type AddMemoryInput,
  type UpdateMemoryInput,
  type SearchQuery,
} from '@/lib/agent-memory';

export const dynamic = 'force-dynamic';

// =============================================================================
// AUTH
// =============================================================================

function verifyAdmin(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  const adminSecret = process.env.ADMIN_SECRET;

  if (cronSecret && authHeader === `Bearer ${cronSecret}`) return true;

  const { searchParams } = new URL(request.url);
  const secret = searchParams.get('secret');
  if (cronSecret && secret === cronSecret) return true;
  if (adminSecret && secret === adminSecret) return true;

  if (process.env.NODE_ENV === 'development') { console.warn('[Security] Dev bypass active — auth skipped (NODE_ENV=development)'); return true; }

  return false;
}

// =============================================================================
// GET — lista o ricerca memorie
// =============================================================================

export async function GET(request: NextRequest) {
  if (!verifyAdmin(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);

  // ?stats=true → restituisce solo le statistiche
  if (searchParams.get('stats') === 'true') {
    const stats = await getMemoryStats();
    return NextResponse.json({ success: true, stats });
  }

  // ?all=true → tutte le memorie senza filtri
  if (searchParams.get('all') === 'true') {
    const entries = await getAllMemories();
    return NextResponse.json({ success: true, entries, total: entries.length });
  }

  // Ricerca con filtri
  const query: SearchQuery = {};

  const q = searchParams.get('q');
  if (q) query.query = q;

  const types = searchParams.get('types');
  if (types) query.types = types.split(',') as SearchQuery['types'];

  const sources = searchParams.get('sources');
  if (sources) query.sources = sources.split(',') as SearchQuery['sources'];

  const brands = searchParams.get('brands');
  if (brands) query.brands = brands.split(',');

  const categories = searchParams.get('categories');
  if (categories) query.categories = categories.split(',');

  const limit = searchParams.get('limit');
  if (limit) query.limit = parseInt(limit, 10);

  const minPriority = searchParams.get('minPriority') as SearchQuery['minPriority'];
  if (minPriority) query.minPriority = minPriority;

  const results = await searchMemory(query);

  return NextResponse.json({
    success: true,
    entries: results.map(r => ({ ...r.entry, relevanceScore: r.relevanceScore, matchedOn: r.matchedOn })),
    total: results.length,
  });
}

// =============================================================================
// POST — aggiunge una nuova memoria
// =============================================================================

export async function POST(request: NextRequest) {
  if (!verifyAdmin(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: AddMemoryInput;
  try {
    body = await request.json() as AddMemoryInput;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.type || !body.title || !body.content) {
    return NextResponse.json(
      { error: 'Missing required fields: type, title, content' },
      { status: 400 }
    );
  }

  // Forza source = 'admin' per le chiamate da questa route
  const input: AddMemoryInput = { ...body, source: 'admin' };

  const entry = await addMemory(input);

  return NextResponse.json({ success: true, entry }, { status: 201 });
}

// =============================================================================
// PUT — aggiorna una memoria esistente
// =============================================================================

export async function PUT(request: NextRequest) {
  if (!verifyAdmin(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: UpdateMemoryInput;
  try {
    body = await request.json() as UpdateMemoryInput;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.id) {
    return NextResponse.json({ error: 'Missing required field: id' }, { status: 400 });
  }

  const entry = await updateMemory(body);

  if (!entry) {
    return NextResponse.json({ error: `Memory not found: ${body.id}` }, { status: 404 });
  }

  return NextResponse.json({ success: true, entry });
}

// =============================================================================
// DELETE — elimina una memoria
// =============================================================================

export async function DELETE(request: NextRequest) {
  if (!verifyAdmin(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: 'Missing required query param: id' }, { status: 400 });
  }

  const deleted = await deleteMemory(id);

  if (!deleted) {
    return NextResponse.json({ error: `Memory not found: ${id}` }, { status: 404 });
  }

  return NextResponse.json({ success: true, deleted: true, id });
}
