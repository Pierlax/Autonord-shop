# CLAUDE.md — Development Guidelines for Autonord Shop

This file contains development conventions, architecture overview, and common commands for working on the Autonord Shop codebase.

---

## Common Commands

```bash
# Install dependencies
pnpm install

# Development server (hot reload)
pnpm dev

# Production build (TypeScript check + Next.js build)
pnpm build

# Type checking only (no build)
pnpm tsc --noEmit

# Lint
pnpm lint
```

**Build requires these environment variables** (set in `.env.local` or Vercel dashboard):

| Variable | Required | Description |
|----------|----------|-------------|
| `SHOPIFY_ADMIN_ACCESS_TOKEN` | Yes | Shopify Admin API token |
| `CRON_SECRET` | Yes | Auth token for cron/worker endpoints |
| `ANTHROPIC_API_KEY` | Yes | Claude AI API key |
| `SERPAPI_API_KEY` | No | SerpAPI for web search (preferred) |
| `EXA_API_KEY` | No | Exa.ai for neural search (fallback) |
| `GOOGLE_SEARCH_API_KEY` | No | Google Custom Search (fallback) |
| `GOOGLE_SEARCH_CX` | No | Google Custom Search engine ID |
| `UPSTASH_REDIS_REST_URL` | No | Upstash Redis for RAG cache (production) |
| `UPSTASH_REDIS_REST_TOKEN` | No | Upstash Redis auth token |
| `QSTASH_TOKEN` | No | Upstash QStash for async job queuing |

---

## Code Style Rules

1. **TypeScript strict mode** — All files must pass `tsc --noEmit` with no errors.
2. **Centralized env** — Always import from `@/lib/env` instead of using `process.env` directly. Required vars use `env.VAR_NAME`, optional vars use `optionalEnv.VAR_NAME`.
3. **No hardcoded secrets** — All tokens, keys, and secrets must come from environment variables.
4. **Shopify GID format** — Always use `toShopifyGid(id, 'Product')` from `@/lib/env` before passing IDs to GraphQL mutations.
5. **Logging** — Use `loggers` from `@/lib/logger` instead of `console.log` in library code. `console.log` is acceptable in route handlers.
6. **Error handling** — Never let errors crash the pipeline silently. Log errors and return graceful fallbacks.

---

## Architecture: RAG Enrichment Pipeline (V5)

The product enrichment pipeline processes each product through 7 sequential steps:

```
QStash / Cron Job
       │
       ▼
┌──────────────────────────────────────────────────────────────┐
│  POST /api/workers/regenerate-product (route.ts — V5)        │
│                                                              │
│  Step 1: UniversalRAG                                        │
│  ├── source-router.ts    → Routes query to source types      │
│  ├── rag-sources.ts      → Whitelisted domains per intent    │
│  ├── search-client.ts    → Real web search (SerpAPI/Exa/GCS) │
│  ├── rag-cache.ts        → Cache layer (Redis or in-memory)  │
│  └── universal-rag.ts    → Orchestrates the RAG pipeline     │
│                                                              │
│  Step 2: RagAdapter                                          │
│  └── rag-adapter.ts      → Transforms RAG output → QA input  │
│                                                              │
│  Step 3: TwoPhaseQA                                          │
│  └── two-phase-qa.ts     → Atomic facts + complex reasoning  │
│                                                              │
│  Step 4: AI Enrichment V3                                    │
│  └── ai-enrichment-v3.ts → Full content (RAG+KG+Provenance) │
│                                                              │
│  Step 5: TAYA Police                                         │
│  └── taya-police.ts      → Post-generation validation        │
│                                                              │
│  Step 6: ImageAgent V4                                       │
│  └── image-agent-v4.ts   → Cross-Code + Gold Standard search │
│                                                              │
│  Step 7: Shopify API                                         │
│  └── GraphQL mutations   → HTML + 7 Metafields + Image (ALT)│
└──────────────────────────────────────────────────────────────┘
```

### Key Modules

| Module | Path | Purpose |
|--------|------|---------|
| **env** | `lib/env.ts` | Centralized env validation (fail-fast) |
| **rag-sources** | `lib/shopify/rag-sources.ts` | Whitelisted domains (brands, retailers, reviews, manuals) |
| **search-client** | `lib/shopify/search-client.ts` | Unified web search with auto-fallback |
| **rag-cache** | `lib/shopify/rag-cache.ts` | Search result caching (Redis or in-memory) |
| **source-router** | `lib/shopify/source-router.ts` | Query intent classification + source routing |
| **universal-rag** | `lib/shopify/universal-rag.ts` | Main RAG pipeline orchestrator |
| **rag-adapter** | `lib/shopify/rag-adapter.ts` | RAG output → TwoPhaseQA input bridge |
| **two-phase-qa** | `lib/shopify/two-phase-qa.ts` | CLaRa-inspired fact extraction + reasoning |
| **ai-enrichment-v3** | `lib/shopify/ai-enrichment-v3.ts` | Full content generation with provenance |
| **taya-police** | `lib/agents/taya-police.ts` | Content validation (TAYA philosophy) |
| **image-agent-v4** | `lib/agents/image-agent-v4.ts` | Product image discovery + vision validation |
| **core-philosophy** | `lib/core-philosophy.ts` | TAYA + Krug + JTBD principles |

### Search Provider Priority

The search client automatically selects the best available provider:

```
SerpAPI (SERPAPI_API_KEY) → Exa (EXA_API_KEY) → Google (GOOGLE_SEARCH_API_KEY) → Mock
```

If the primary provider fails, it falls back to the next available one. If all fail, mock results are returned so the pipeline never crashes.

### Cache TTL by Intent

| Intent | TTL | Rationale |
|--------|-----|-----------|
| `specs` | 7 days | Technical specs rarely change |
| `manuals` | 14 days | Manuals almost never change |
| `reviews` | 3 days | Reviews update more frequently |
| `images` | 7 days | Product images are stable |
| `default` | 5 days | General fallback |

---

## File Organization

```
Autonord-shop/
├── app/
│   ├── api/
│   │   ├── cron/              # Scheduled jobs (Vercel Cron)
│   │   ├── webhooks/          # Shopify webhook handlers
│   │   ├── workers/           # QStash async workers
│   │   ├── admin/             # Admin utilities
│   │   ├── debug/             # Debug endpoints
│   │   ├── sync/              # Danea ERP sync
│   │   └── test/              # Test endpoints
│   ├── blog/                  # Blog pages
│   ├── products/              # Product pages
│   └── ...                    # Other pages
├── lib/
│   ├── env.ts                 # Environment variable validation
│   ├── logger.ts              # Logging utilities
│   ├── core-philosophy.ts     # TAYA/Krug/JTBD principles
│   ├── shopify/               # Shopify integration modules
│   │   ├── admin-api.ts       # Shopify Admin API client
│   │   ├── ai-enrichment-v3.ts
│   │   ├── universal-rag.ts
│   │   ├── rag-sources.ts
│   │   ├── rag-adapter.ts
│   │   ├── rag-cache.ts
│   │   ├── search-client.ts
│   │   ├── source-router.ts
│   │   ├── two-phase-qa.ts
│   │   └── ...
│   ├── agents/                # AI agents
│   │   ├── image-agent-v4.ts
│   │   ├── taya-police.ts
│   │   └── ...
│   ├── queue/                 # QStash job queue
│   └── blog-researcher/       # Blog content research
├── data/                      # Static data (benchmarks, etc.)
├── scripts/                   # Utility scripts
├── CLAUDE.md                  # This file
└── package.json
```

---

## Security Checklist

Before pushing code, verify:

- [ ] No hardcoded tokens or secrets (grep for strings like `Bearer`, API keys)
- [ ] All new env vars added to `lib/env.ts` (required or optional interface)
- [ ] All Shopify IDs use `toShopifyGid()` before GraphQL mutations
- [ ] Worker/cron endpoints check `isAuthorized()` before processing
- [ ] Error responses don't leak internal details to the client
