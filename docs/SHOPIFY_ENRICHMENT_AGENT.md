# Shopify Product Enrichment Agent

Agente automatico che arricchisce i prodotti Shopify con contenuti TAYA-style generati da AI e immagini cercate automaticamente.

## Architettura Queue-Based

**IMPORTANTE:** Questo agent usa un'architettura a code per evitare i timeout di Vercel (10-60 secondi).

```
┌─────────────────────────────────────────────────────────────────────┐
│                        FLUSSO ASINCRONO                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Shopify                    Vercel                    Upstash       │
│  ───────                    ──────                    ───────       │
│                                                                     │
│  products/create ──────────► /api/webhooks/enrich-product           │
│                              (valida HMAC, <1 secondo)              │
│                                      │                              │
│                                      ▼                              │
│                              Aggiungi a QStash ─────────► Queue     │
│                                      │                              │
│                                      ▼                              │
│                              Ritorna 202 Accepted                   │
│                              (Shopify soddisfatto)                  │
│                                                                     │
│  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ │
│                                                                     │
│                              QStash chiama worker                   │
│                                      │                              │
│                                      ▼                              │
│                              /api/workers/enrich-product            │
│                              (può durare 30-60 secondi)             │
│                                      │                              │
│                                      ▼                              │
│                              Claude Opus 4.1 genera contenuti       │
│                                      │                              │
│                                      ▼                              │
│                              SerpAPI cerca immagini                 │
│                                      │                              │
│                                      ▼                              │
│  Prodotto arricchito ◄────── Shopify Admin API update               │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## Vantaggi dell'Architettura Queue

| Problema | Soluzione |
|----------|-----------|
| Timeout Vercel (10s hobby, 60s pro) | Worker separato con retry automatici |
| Shopify timeout webhook (5s) | Risposta immediata 202 Accepted |
| Picchi di carico (100 prodotti insieme) | QStash gestisce la coda |
| Errori transitori | Retry automatici con backoff |

## Panoramica

Quando il gestionale crea un nuovo prodotto su Shopify (con solo dati grezzi: SKU, Prezzo, Titolo, EAN), questo sistema:

1. **Webhook** riceve il payload e valida HMAC (<1 secondo)
2. **Queue** aggiunge il job a QStash
3. **Worker** processa il prodotto (fino a 60 secondi):
   - Genera contenuti con Claude Opus 4.1
   - Cerca immagini con SerpAPI
   - Aggiorna Shopify
4. **Retry** automatici in caso di errore (3 tentativi)

## Campi Modificati

| Campo | Azione |
|-------|--------|
| `body_html` | Sostituito con descrizione AI + Pro/Contro + FAQ |
| `tags` | Aggiunto `AI-Enhanced` |
| `images` | Aggiunte fino a 3 immagini (se mancanti) |
| `metafield: custom.pros` | JSON array dei vantaggi |
| `metafield: custom.cons` | JSON array degli svantaggi |
| `metafield: custom.faqs` | JSON array delle FAQ |
| `metafield: custom.ai_description` | Descrizione pura (senza HTML) |

## Campi NON Modificati (Sacri)

- `title` - Gestito dal gestionale
- `price` / `compare_at_price` - Gestito dal gestionale
- `sku` - Gestito dal gestionale
- `barcode` (EAN) - Gestito dal gestionale
- `inventory_quantity` - Gestito dal gestionale

## Variabili d'Ambiente Richieste

```env
# Shopify Admin API
SHOPIFY_SHOP_DOMAIN=your-store.myshopify.com
SHOPIFY_ADMIN_ACCESS_TOKEN=shpat_xxxxxxxxxxxxx
SHOPIFY_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxx

# Upstash QStash (per la coda)
QSTASH_TOKEN=xxxxxxxxxxxxx
QSTASH_CURRENT_SIGNING_KEY=sig_xxxxxxxxxxxxx
QSTASH_NEXT_SIGNING_KEY=sig_xxxxxxxxxxxxx

# Anthropic Claude
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxx

# Image Search (opzionale ma consigliato)
SERPAPI_API_KEY=xxxxxxxxxxxxx
```

## Setup Upstash QStash

1. Vai su https://console.upstash.com
2. Crea un account (piano gratuito disponibile)
3. Crea un nuovo progetto QStash
4. Copia le credenziali:
   - `QSTASH_TOKEN` - Token principale
   - `QSTASH_CURRENT_SIGNING_KEY` - Per verificare le richieste
   - `QSTASH_NEXT_SIGNING_KEY` - Chiave di rotazione
5. Aggiungi le variabili su Vercel

### Costi Upstash

| Piano | Messaggi/mese | Costo |
|-------|---------------|-------|
| Free | 500 | $0 |
| Pay as you go | Illimitati | $1 per 100k messaggi |

Per 2000 prodotti: **gratuito** (rientra nel piano free)

## Ricerca Immagini

L'agent cerca automaticamente immagini per i prodotti che ne sono privi:

### Strategia di Ricerca

1. **Query primaria:** `{brand} {sku}` (es. "Milwaukee 4933479862")
2. **Query secondaria:** `{brand} {model}` (es. "Milwaukee M18 FPD3")
3. **Query terziaria:** `{title} {brand}` (es. "Trapano a percussione Milwaukee")

### Mappatura Brand

Il sistema converte automaticamente i nomi legali in brand:

| Vendor (dal gestionale) | Brand (per ricerca) |
|------------------------|---------------------|
| TECHTRONIC INDUSTRIES ITALIA SRL | Milwaukee |
| MAKITA SPA | Makita |
| ROBERT BOSCH SPA | Bosch |
| STANLEY BLACK & DECKER ITALIA SRL | DeWalt |
| HILTI ITALIA SPA | Hilti |
| METABO SRL | Metabo |

### Limiti

- Massimo 3 immagini per prodotto
- Solo immagini JPG, PNG, WebP
- Validazione URL prima dell'upload
- Se SERPAPI_API_KEY non è configurato, la ricerca immagini viene saltata

## Setup Webhook su Shopify

1. Vai su **Settings > Notifications > Webhooks**
2. Clicca **Create webhook**
3. Configura:
   - **Event:** Product creation
   - **Format:** JSON
   - **URL:** `https://your-domain.vercel.app/api/webhooks/enrich-product`
   - **API version:** 2024-01
4. Copia il **Webhook secret** e salvalo in `SHOPIFY_WEBHOOK_SECRET`

## Permessi App Shopify Richiesti

L'app Shopify deve avere questi scope:

- `read_products` - Per leggere i dati del prodotto
- `write_products` - Per aggiornare body_html, tags e immagini

## Endpoint

| Endpoint | Metodo | Descrizione |
|----------|--------|-------------|
| `/api/webhooks/enrich-product` | POST | Riceve webhook Shopify, aggiunge a coda |
| `/api/webhooks/enrich-product` | GET | Health check e info |
| `/api/workers/enrich-product` | POST | Worker che processa i job (chiamato da QStash) |
| `/api/workers/enrich-product` | GET | Health check worker |

## Monitoraggio

### Vercel Logs

Cerca questi pattern nei log:

```
[Webhook] Received from ... - Webhook ricevuto
[Webhook] Product X queued - Aggiunto a coda
[Worker] Processing product X - Worker sta elaborando
[Worker] Successfully enriched - Completato con successo
```

### Upstash Console

1. Vai su https://console.upstash.com
2. Seleziona il tuo progetto QStash
3. Tab "Logs" mostra tutti i messaggi e i retry

## Troubleshooting

| Problema | Causa | Soluzione |
|----------|-------|-----------|
| Webhook timeout | Elaborazione sincrona | Usa architettura queue (già implementata) |
| "QSTASH_TOKEN not set" | Variabile mancante | Aggiungi su Vercel |
| Worker non chiamato | URL non pubblico | Verifica deploy su Vercel |
| Retry infiniti | Errore nel worker | Controlla logs Vercel |
| Prodotto non arricchito | Tag già presente | Normale, skip intenzionale |

## Costi Operativi

| Servizio | Per Prodotto | Per 2000 Prodotti |
|----------|--------------|-------------------|
| Claude Opus 4.1 | ~$0.02 | ~$40 |
| SerpAPI | ~$0.01 | ~$20 |
| Upstash QStash | ~$0.00 | $0 (piano free) |
| **Totale** | ~$0.03 | ~$60 |

## File del Progetto

```
lib/queue/index.ts                      # Infrastruttura coda
lib/shopify/ai-enrichment.ts            # Generazione contenuti AI
lib/shopify/image-search.ts             # Ricerca immagini
lib/shopify/admin-api.ts                # API Shopify Admin
lib/shopify/webhook-verify.ts           # Verifica HMAC
app/api/webhooks/enrich-product/route.ts # Webhook endpoint
app/api/workers/enrich-product/route.ts  # Worker endpoint
```
