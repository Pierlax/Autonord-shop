# TAYA Director - Central AI Orchestrator

Il **TAYA Director** è il cervello centrale che coordina tutti gli agenti AI del sistema Autonord. Funziona come un direttore editoriale automatico che supervisiona la qualità dei contenuti e pianifica la strategia.

## Architettura

```
                    ┌─────────────────────────────────┐
                    │        TAYA DIRECTOR            │
                    │   /api/cron/taya-director       │
                    │   (Esegue ogni notte alle 2:00) │
                    └────────────────┬────────────────┘
                                     │
           ┌─────────────────────────┼─────────────────────────┐
           │                         │                         │
           ▼                         ▼                         ▼
    ┌─────────────┐           ┌─────────────┐           ┌─────────────┐
    │  SUPERVISOR │           │  STRATEGIST │           │ORCHESTRATOR │
    │  (Editor)   │           │  (Planner)  │           │(Coordinator)│
    └──────┬──────┘           └──────┬──────┘           └──────┬──────┘
           │                         │                         │
           │ Valuta qualità          │ Identifica gap          │ Coordina via
           │ contenuti TAYA          │ contenuti               │ QStash
           │                         │                         │
           ▼                         ▼                         ▼
    ┌─────────────┐           ┌─────────────┐           ┌─────────────┐
    │  Agente 1   │           │  Agente 2   │           │  Agente 3   │
    │  (Prodotti) │           │   (Blog)    │           │   (Code)    │
    └─────────────┘           └─────────────┘           └─────────────┘
```

## Moduli

### 1. Supervisor (The Editor)

**File:** `lib/taya-director/supervisor.ts`

Valuta la qualità dei contenuti AI-generated secondo i principi TAYA:

| Criterio | Peso | Descrizione |
|----------|------|-------------|
| **TAYA Compliance** | 35% | Onestà, ammette limiti, no superlativi vuoti |
| **Readability** | 20% | Chiarezza, semplicità, no gergo |
| **Uniqueness** | 25% | Contenuto originale, non generico |
| **Actionability** | 20% | Aiuta il cliente a decidere |

**Score minimo per passare:** 70/100

Se un prodotto non passa, viene ri-inviato all'Agente 1 con un prompt più severo.

### 2. Strategist (The Planner)

**File:** `lib/taya-director/strategist.ts`

Analizza il catalogo e identifica:

- **Category Gaps:** Categorie con molti prodotti ma nessun articolo blog
- **Brand Gaps:** Brand importanti senza articoli di confronto
- **Enrichment Gaps:** Prodotti senza contenuti AI
- **AI Suggestions:** Idee per nuovi contenuti basate su analisi AI

Output: **Piano Editoriale** con priorità (critical, high, medium, low)

### 3. Orchestrator (The Coordinator)

**File:** `lib/taya-director/orchestrator.ts`

Esegue le decisioni tramite QStash:

- `queueProductReEnrichment()` - Ri-processa prodotti con score basso
- `queueArticleCommission()` - Commissiona nuovi articoli al Blog Researcher
- `queueBulkEnrichment()` - Arricchisce prodotti nuovi

**Rate Limits:**
- Max 10 prodotti ri-processati/giorno
- Max 2 articoli commissionati/settimana
- Max 1 PR GitHub/settimana

## Configurazione

### Variabili Ambiente Richieste

```env
# Anthropic (per valutazione qualità)
ANTHROPIC_API_KEY=sk-ant-...

# Shopify (per leggere prodotti/articoli)
SHOPIFY_SHOP_DOMAIN=your-store.myshopify.com
SHOPIFY_ADMIN_ACCESS_TOKEN=shpat_...

# QStash (per orchestrazione)
QSTASH_TOKEN=...
QSTASH_CURRENT_SIGNING_KEY=...
QSTASH_NEXT_SIGNING_KEY=...

# Opzionale: per proteggere endpoint cron
CRON_SECRET=your-secret-key
```

### Vercel Cron

Il Director è configurato per eseguire ogni notte alle 2:00 AM:

```json
// vercel.json
{
  "crons": [
    {
      "path": "/api/cron/taya-director",
      "schedule": "0 2 * * *"
    }
  ]
}
```

## Utilizzo

### Esecuzione Automatica (Cron)

Il Director esegue automaticamente ogni notte. Controlla i log su Vercel per vedere i risultati.

### Esecuzione Manuale

```bash
# Trigger via curl
curl -X POST https://autonord-shop.vercel.app/api/cron/taya-director \
  -H "Authorization: Bearer YOUR_CRON_SECRET"

# Con config personalizzata
curl -X POST https://autonord-shop.vercel.app/api/cron/taya-director \
  -H "Authorization: Bearer YOUR_CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"config": {"minQualityScore": 80}}'
```

### Risposta Esempio

```json
{
  "success": true,
  "sessionId": "director-1705312800000-abc123",
  "summary": {
    "productsEvaluated": 15,
    "productsPassed": 12,
    "productsFailed": 3,
    "articlesCommissioned": 1,
    "decisionsCount": 4,
    "errorsCount": 0
  },
  "completedAt": "2024-01-15T02:05:30.000Z"
}
```

## Flusso di Esecuzione

```
1. FETCH DATA
   └── Recupera prodotti aggiornati nelle ultime 24h
   └── Recupera articoli blog esistenti

2. SUPERVISOR PHASE
   └── Filtra prodotti AI-Enhanced
   └── Valuta qualità con Claude
   └── Calcola score (0-100)
   └── Marca passed/failed

3. STRATEGIST PHASE
   └── Analizza gap categorie
   └── Analizza gap brand
   └── Chiede suggerimenti a Claude
   └── Genera piano editoriale

4. ORCHESTRATOR PHASE
   └── Queue re-enrichment per prodotti failed
   └── Commission articolo se gap high/critical
   └── Queue enrichment per prodotti nuovi

5. SESSION COMPLETE
   └── Log summary
   └── Return results
```

## Quality Scoring

Il Supervisor usa Claude per valutare ogni prodotto:

```typescript
interface QualityScore {
  tayaCompliance: number;  // 0-100
  readability: number;     // 0-100
  uniqueness: number;      // 0-100
  actionability: number;   // 0-100
  overall: number;         // Weighted average
}
```

### Esempi di Violazioni TAYA

| Tipo | Esempio | Penalità |
|------|---------|----------|
| Superlativo vuoto | "Il migliore sul mercato" | -15 punti |
| Mancanza difetti | Nessun contro elencato | -20 punti |
| Contenuto generico | "Prodotto di alta qualità" | -10 punti |
| Gergo non spiegato | "Brushless BLDC" senza spiegazione | -5 punti |

## Troubleshooting

### Il Director non esegue

1. Verifica che le variabili ambiente siano configurate su Vercel
2. Controlla i log di Vercel per errori
3. Verifica che il cron sia attivo (Vercel Dashboard → Crons)

### Nessun prodotto valutato

1. Verifica che ci siano prodotti con tag "AI-Enhanced"
2. Controlla che i prodotti siano stati aggiornati nelle ultime 24h
3. Verifica le credenziali Shopify

### Errori QStash

1. Verifica QSTASH_TOKEN
2. Controlla la dashboard QStash per messaggi in coda
3. Verifica che gli endpoint worker siano raggiungibili

## Metriche e Monitoraggio

### Log Console (Vercel)

```
╔════════════════════════════════════════════════════════════╗
║              TAYA DIRECTOR - SESSION SUMMARY               ║
╠════════════════════════════════════════════════════════════╣
║ Session ID: director-1705312800000-abc123                  ║
║ Duration: 45s                                              ║
╠════════════════════════════════════════════════════════════╣
║ SUPERVISOR RESULTS                                         ║
║   Products evaluated: 15                                   ║
║   Passed: 12                                               ║
║   Failed: 3                                                ║
╠════════════════════════════════════════════════════════════╣
║ ORCHESTRATION                                              ║
║   Decisions made: 4                                        ║
║   Jobs queued: 4                                           ║
║   Jobs failed: 0                                           ║
║   Articles commissioned: 1                                 ║
╚════════════════════════════════════════════════════════════╝
```

### Dashboard QStash

Monitora i job in coda su: https://console.upstash.com/qstash

## Evoluzione Futura

- [ ] Dashboard web per visualizzare sessioni e metriche
- [ ] Notifiche Slack/Email per report giornalieri
- [ ] A/B testing su prompt di enrichment
- [ ] Machine learning per prevedere score prima di generare
