# PROJECT_STATUS.md
**Autonord Shop — AI Enrichment Pipeline**
**Documento per Tech Lead | Aggiornato: 2026-03-09 | ImageAgent V4: COMPLETATO E STABILE**

---

## 1. Architettura Attuale (Cosa Funziona)

### 1.1 Pipeline Core (V5) — FUNZIONANTE

Il motore di arricchimento prodotti è operativo end-to-end. Il flusso esegue 7 step sequenziali per ogni prodotto:

```
[Trigger: QStash / Cron / Webhook / Singolo]
         |
         v
POST /api/workers/regenerate-product
         |
  Step 1: UniversalRAG
          source-router.ts   → Classifica intent (specs / manuals / reviews / images)
          rag-sources.ts     → Domini whitelist per tipo di fonte
          search-client.ts   → Web search reale (SerpAPI > Exa > GCS > Mock)
          rag-cache.ts       → Cache layer (Redis in prod / in-memory in dev)
          universal-rag.ts   → Orchestratore RAG
         |
  Step 2: RagAdapter
          rag-adapter.ts     → Trasforma output RAG in input per TwoPhaseQA
         |
  Step 3: TwoPhaseQA
          two-phase-qa.ts    → Estrazione fatti atomici + reasoning complesso
         |
  Step 4: AI Enrichment V3
          ai-enrichment-v3.ts → Generazione contenuto completo (RAG+KG+Provenance)
         |
  Step 5: TAYA Police
          taya-police.ts     → Validazione post-generazione (filosofia TAYA/Krug/JTBD)
         |
  Step 6: ImageAgent V4
          image-agent-v4.ts  → [VEDI SEZIONE 1.3]
         |
  Step 7: Shopify GraphQL API
          productUpdate mutation → HTML + 7 Metafield + Tag + SEO
```

### 1.2 Fix Architetturale V3 — CONFERMATO

**Problema risolto:** prima di questo fix, `ai-enrichment-v3.ts` ignorava i dati RAG/QA e chiamava autonomamente `product-research.ts`, chiedendo a Gemini di "cercare sul web" senza averne accesso reale, causando **allucinazioni sistematiche**.

**Soluzione attuale (confermata nel codice):**
- `ai-enrichment-v3.ts` riceve `ragResult` e `qaResult` come parametri **obbligatori**
- Nessuna ricerca autonoma: il flusso è strettamente `RAG → QA → V3`
- Import di `product-research.ts` e `source-fusion.ts` rimossi (righe 27-31 del file)

**Modelli AI in uso (confermato in `lib/shopify/ai-client.ts`):**
- **Modello primario:** `gemini-2.5-flash` — usato per generazione contenuto completo
- **Modello lite:** `gemini-2.5-flash-lite` — usato per task leggeri (classificazione, estrazione fatti atomici in TwoPhaseQA Step 1 e Step 2)
- **Rate limiting:** 15 RPM con throttle queue + retry esponenziale (3x, delay 4s/8s/16s)
- Il modello lite viene usato esplicitamente in `two-phase-qa.ts:248` e `two-phase-qa.ts:379` per evitare crash nel parsing JSON su prompt complessi

**Domande dinamiche per categoria:**
- `source-router.ts` classifica l'intent del prodotto (specs / manuals / reviews / images)
- `universal-rag.ts` ottimizza le query in base al tipo di fonte e alla categoria merceologica

### 1.3 ImageAgent V4 — COMPLETATO E STABILE ✓

**Test di produzione superato** (2026-03-09) su Milwaukee H800E AVR (ID: 10139022491990):
- `method: official_site` — immagine trovata da milwaukeetool.com
- `source: milwaukeetool.com`, `success: true`
- URL: `https://www.milwaukeetool.com/--/web-images/sc/e2b66b178df34e4cbda5feae756102db`
- `has_amp: false` (entità HTML decodificate correttamente)
- Risoluzione massimizzata (parametri resize rimossi)
- TypeScript: `tsc --noEmit` → zero errori

**Architettura: 3-step cascade (per tutte e 3 le search function)**
1. **Step A:** `searchProductImages()` → URL diretti da Google Images API (SerpAPI / GCS)
2. **Step B:** `performWebSearch()` + `fetchOgImageFromPage()` → fetch HTTP reale + estrazione `og:image`
3. **Step C:** Gemini su snippets (last resort — fallback, bassa affidabilità)

**8 fix applicati e confermati:**
1. `searchProductImages()` restituisce `[]` invece di mock URL quando nessun provider è configurato
2. `searchImagesWithSerpApi()` — usa `engine=google_images`, restituisce URL CDN diretti
3. `searchImagesWithGoogle()` — usa `searchType=image`, `imgType=photo`, `imgSize=large`
4. `fetchOgImageFromPage()` — fetch HTTP reale, legge i primi 50KB, estrae `og:image` → `twitter:image`
5. `decodeHtmlEntities()` — decodifica `&amp;` negli attributi HTML di `og:image`
6. Decodifica entità in `searchImagesWithSerpApi()` — SerpAPI a volte HTML-encoda le URL
7. `maximizeImageUrl()` — rimuove params resize (`w`, `h`, `width`, `height`) < 400px
8. `isValidImageUrl()` esteso — rifiuta percorsi social media tile (`/facebook/`, `/twitter/`, `-tile.jpg`, ecc.)

**Dipendenze:**
- Con `SERPAPI_API_KEY`: Step A via Google Images (alta qualità)
- Con `GOOGLE_SEARCH_API_KEY` + `GOOGLE_SEARCH_CX`: Step A via GCS (fallback)
- Senza nessuna API key: Step A restituisce `[]` → passa a Step B (og:image) → Step C (Gemini)

### 1.4 Aggiornamento Shopify via GraphQL — FUNZIONANTE

Il Step 7 usa direttamente il **Shopify Admin API GraphQL** (versione `2024-01`) con mutation `productUpdate`.

**Campi aggiornati per ogni prodotto:**
| Campo | Tipo | Contenuto |
|---|---|---|
| `descriptionHtml` | HTML | Descrizione AI generata (TAYA + JTBD + Krug) |
| `tags` | Array | `['AI-Enhanced', 'TAYA-V5']` |
| `seo.title` | String | Estratto dai primi 60 char della descrizione |
| `seo.description` | String | Estratto dai primi 160 char |
| `metafield: custom.pros` | JSON | Lista pro (validata da TAYA Police) |
| `metafield: custom.cons` | JSON | Lista contro (validata da TAYA Police) |
| `metafield: custom.faqs` | JSON | FAQ generate da TwoPhaseQA |
| `metafield: custom.ai_description` | String | Descrizione breve SEO |
| `metafield: custom.specs` | JSON | Specifiche tecniche fact-checked |
| `metafield: custom.expert_opinion` | String | Verdetto tecnico da QA |

**Preservati (non toccati mai):** `title`, `price`, `sku`, `barcode`, `inventory`

### 1.5 Webhook Shopify — SVILUPPATO

L'endpoint `/api/webhooks/enrich-product` gestisce `products/create` e `products/update`:
- Verifica HMAC Shopify
- Skip automatico se il prodotto ha già il tag `AI-Enhanced`
- Accodamento asincrono via QStash (risposta `202 Accepted` in < 1 secondo)
- Retry automatico 3x su failure

### 1.6 Cache RAG — FUNZIONANTE (dual-mode)

`lib/shopify/rag-cache.ts` supporta due backend:
- **Upstash Redis** (produzione): richiede `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`
- **In-Memory Map** (sviluppo / fallback): persiste per la durata del processo Node.js

TTL configurati: specs=7gg, manuals=14gg, reviews=3gg, images=7gg

---

## 2. Roadmap per la Produzione (TODO List)

### FASE 0: Pre-Requisiti Operativi (Immediato)

- [ ] **Installare dipendenze:** `pnpm install` nella root del progetto
- [ ] **Creare `.env.local`** con tutte le variabili richieste (vedi `CLAUDE.md`)
  - `SHOPIFY_ADMIN_ACCESS_TOKEN` (obbligatorio)
  - `SHOPIFY_SHOP_DOMAIN` (obbligatorio)
  - `CRON_SECRET` (obbligatorio)
  - `GOOGLE_GENERATIVE_AI_API_KEY` (obbligatorio)
  - `QSTASH_TOKEN` (obbligatorio per async)
  - `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` (obbligatorio per cache prod)
- [ ] **Eseguire `pnpm build`** e verificare zero errori TypeScript
- [ ] **Registrare webhook Shopify** puntando a `/api/webhooks/enrich-product` per `products/create`

---

### FASE 1: Bulk Sync & Code Asincrone

**Obiettivo:** processare N prodotti senza sfondare rate limit Gemini (15 RPM) e senza timeout Vercel (max 60s).

**Architettura target:**
```
Admin Dashboard
     |
     v
POST /api/cron/force-enrich-all  (o endpoint dedicato)
     |
     v  per ogni productId
QStash.publishJSON({ url: /api/workers/regenerate-product, delay: N*4s })
     |
     v
Redis: SET enrichment:status:{productId} "queued" EX 86400
```

- [ ] Creare endpoint `POST /api/admin/bulk-enrich` che accetta un array di product ID
- [ ] Usare `lib/queue/index.ts` (`queueProductEnrichment`) con delay crescente tra i job per rispettare il rate limit (es. 4s tra job = 15 RPM)
- [ ] Scrivere stato di avanzamento su Redis: `enrichment:status:{productId}` = `queued | processing | done | error`
- [ ] Verificare che `lib/queue/index.ts` configuri correttamente `QSTASH_TOKEN` (attualmente lazy-init, funziona)

**File chiave:** `lib/queue/index.ts`, `app/api/cron/force-enrich-all/route.ts`

---

### FASE 2: Interfaccia Bulk Dashboard

**Obiettivo:** UI per selezionare N prodotti, inviarli alla coda QStash, e monitorare l'avanzamento in real-time.

- [ ] Creare `app/admin/dashboard/page.tsx` (pagina protetta da `CRON_SECRET`)
- [ ] Sezione "Bulk Enrichment":
  - Input: lista product ID o fetch automatico da Shopify (prodotti senza tag `AI-Enhanced`)
  - Pulsante "Avvia Enrichment" → chiama `/api/admin/bulk-enrich`
  - Tabella di avanzamento con polling ogni 5s su `/api/admin/enrichment-status`
- [ ] Creare `app/api/admin/enrichment-status/route.ts` che legge da Redis `enrichment:status:*`
- [ ] Sezione "Test Singolo Prodotto" (già parzialmente prevista in `app/api/test/pipeline/route.ts`)

**Stack UI suggerito:** Tailwind (gia configurato) + polling nativo con `setInterval` (no websocket necessario)

---

### FASE 3: Automazione via Webhook

**Obiettivo:** ogni nuovo prodotto aggiunto su Shopify entra automaticamente nella pipeline senza intervento manuale.

**Stato attuale:** il webhook handler `/api/webhooks/enrich-product` e' gia scritto e funzionante. Manca solo la registrazione su Shopify Admin.

- [ ] Registrare il webhook `products/create` su Shopify Admin
  - Via API: `POST /admin/api/2024-01/webhooks.json`
  - URL: `https://{NEXT_PUBLIC_BASE_URL}/api/webhooks/enrich-product`
  - Topic: `products/create`
  - Format: `json`
- [ ] Aggiungere `SHOPIFY_WEBHOOK_SECRET` (secret HMAC) in `.env.local` e in `lib/shopify/webhook-verify.ts`
- [ ] Testare il flusso end-to-end: creare prodotto su Shopify → verificare job in QStash dashboard → verificare metafield aggiornati
- [ ] (Opzionale) Aggiungere `products/update` per prodotti modificati manualmente nel gestionale

**File chiave:** `app/api/webhooks/enrich-product/route.ts`, `lib/shopify/webhook-verify.ts`

---

### FASE 4: Fallback & Edge Cases

**Obiettivo:** garantire che la pipeline non alluci quando i dati reali sono scarsi o assenti.

**Scenari da gestire:**

- [ ] **RAG restituisce 0 risultati** (prodotto sconosciuto, nessuna search API configurata, o rate limit provider)
  - Attuale: `no-retrieval-detector.ts` gestisce `parametric_only` mode ma non e' integrato nel fallback esplicito
  - Fix: se `ragResult.sources.length === 0`, usare la descrizione originale Shopify (`body_html` esistente) come contesto minimo, senza generare contenuto
  - Mai restituire un prodotto arricchito con zero fonti verificate
- [ ] **Gemini restituisce JSON malformato** (gia' mitigato con `gemini-2.5-flash-lite` per parsing strutturato)
  - Aggiungere schema Zod di validazione per l'output di `ai-enrichment-v3.ts` usando `generateObjectSafe()` gia' disponibile in `ai-client.ts`
- [ ] **Shopify GraphQL mutation fallisce** (prodotto archiviato, permessi insufficienti)
  - Attuale: l'errore e' loggato ma non registrato permanentemente
  - Fix: scrivere su Redis `enrichment:status:{productId} = error:{message}` per retry manuale
- [ ] **Rate limit QStash** (troppi job in coda)
  - Aggiungere delay incrementale tra i publish (gia' supportato da QStash con parametro `delay`)
- [x] **ImageAgent V4 — COMPLETATO** (vedi sezione 1.3)
  - Whitelist domini: già filtrata tramite `searchGoldStandard` (solo brand ufficiali) e `isValidImageUrl()`
  - Per validazione dimensione immagine (min 800x800px) aggiungere HEAD request prima dell'upload Shopify (opzionale)

---

## 3. Stato Variabili d'Ambiente

| Variabile | Stato | Note |
|---|---|---|
| `SHOPIFY_ADMIN_ACCESS_TOKEN` | DA CONFIGURARE | Obbligatorio |
| `SHOPIFY_SHOP_DOMAIN` | DA CONFIGURARE | Obbligatorio |
| `CRON_SECRET` | DA CONFIGURARE | Obbligatorio |
| `GOOGLE_GENERATIVE_AI_API_KEY` | DA CONFIGURARE | Obbligatorio |
| `QSTASH_TOKEN` | DA CONFIGURARE | Obbligatorio per Fase 1 |
| `UPSTASH_REDIS_REST_URL` | DA CONFIGURARE | Obbligatorio per Fase 1 cache |
| `UPSTASH_REDIS_REST_TOKEN` | DA CONFIGURARE | Obbligatorio per Fase 1 cache |
| `SERPAPI_API_KEY` | OPZIONALE | Necessario per ImageAgent V4 |
| `EXA_API_KEY` | OPZIONALE | Fallback search provider |
| `NEXT_PUBLIC_BASE_URL` | DA CONFIGURARE | Necessario per URL webhook QStash |

---

## 4. File Chiave di Riferimento

| Componente | Path |
|---|---|
| Entry point pipeline | `app/api/workers/regenerate-product/route.ts` |
| AI Client (Gemini) | `lib/shopify/ai-client.ts` |
| RAG Orchestrator | `lib/shopify/universal-rag.ts` |
| TwoPhaseQA | `lib/shopify/two-phase-qa.ts` |
| AI Enrichment V3 | `lib/shopify/ai-enrichment-v3.ts` |
| TAYA Police | `lib/agents/taya-police.ts` |
| ImageAgent V4 | `lib/agents/image-agent-v4.ts` |
| Queue (QStash) | `lib/queue/index.ts` |
| Cache (Redis) | `lib/shopify/rag-cache.ts` |
| Webhook handler | `app/api/webhooks/enrich-product/route.ts` |
| Env validation | `lib/env.ts` |
| Filosofia (TAYA/Krug/JTBD) | `lib/core-philosophy/index.ts` |
| Linee guida sviluppo | `CLAUDE.md` |
