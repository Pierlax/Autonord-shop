# Shopify Product Enrichment Agent

Agente automatico che arricchisce i prodotti Shopify con contenuti TAYA-style generati da AI e immagini cercate automaticamente.

## Panoramica

Quando il gestionale crea un nuovo prodotto su Shopify (con solo dati grezzi: SKU, Prezzo, Titolo, EAN), questo webhook:

1. **Riceve** il payload del prodotto via webhook `products/create`
2. **Verifica** l'autenticità con HMAC
3. **Controlla** se il prodotto è già arricchito (tag `AI-Enhanced`)
4. **Genera** contenuti con Anthropic Claude (claude-sonnet-4-20250514):
   - Descrizione TAYA-style (focus sui problemi risolti)
   - 3 PRO tecnici specifici
   - 2 CONTRO onesti
   - 3 FAQ tecniche
5. **Cerca** immagini del prodotto (se mancanti) via SerpAPI Google Images
6. **Aggiorna** Shopify senza toccare i dati del gestionale

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

# Anthropic Claude
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxx

# Image Search (opzionale ma consigliato)
SERPAPI_API_KEY=xxxxxxxxxxxxx
```

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
- `read_product_listings` - Per accedere ai metafields
- `write_product_listings` - Per creare/aggiornare metafields

## Struttura Metafields

### custom.pros
```json
[
  "Potenza 1400W per foratura in calcestruzzo armato",
  "Sistema anti-vibrazione AVR per uso prolungato",
  "Mandrino SDS-Plus per cambio rapido punte"
]
```

### custom.cons
```json
[
  "Peso 3.2kg può affaticare in lavori overhead",
  "Prezzo superiore alla media di categoria"
]
```

### custom.faqs
```json
[
  {
    "question": "Posso usarlo per forare il ferro?",
    "answer": "Sì, con le punte appropriate. Disattiva la percussione per il metallo."
  },
  {
    "question": "Che punte posso usare?",
    "answer": "Tutte le punte SDS-Plus standard. Compatibile con accessori Bosch, Makita, DeWalt."
  },
  {
    "question": "È adatto per uso intensivo quotidiano?",
    "answer": "Sì, è progettato per professionisti. Consigliamo pause ogni 30 minuti per raffreddamento."
  }
]
```

## Utilizzo Metafields nel Frontend

Nel componente React della scheda prodotto:

```tsx
// Recupera i metafields dal prodotto
const pros = product.metafields?.find(m => m.key === 'pros')?.value;
const cons = product.metafields?.find(m => m.key === 'cons')?.value;
const faqs = product.metafields?.find(m => m.key === 'faqs')?.value;

// Parse JSON
const prosArray = pros ? JSON.parse(pros) : [];
const consArray = cons ? JSON.parse(cons) : [];
const faqsArray = faqs ? JSON.parse(faqs) : [];
```

## Testing Locale

Per testare localmente senza webhook reale:

```bash
# 1. Avvia il server
pnpm dev

# 2. Invia una richiesta di test (senza HMAC verification)
curl -X POST http://localhost:3000/api/webhooks/enrich-product \
  -H "Content-Type: application/json" \
  -H "X-Shopify-Topic: products/create" \
  -d '{"id": 123, "title": "Test Product", "vendor": "Milwaukee", "tags": "", "images": [], "variants": [{"sku": "TEST-001"}]}'
```

## Logging

Tutti i log usano prefissi per facile filtraggio:

```
[Enrichment] Received webhook from store.myshopify.com, topic: products/create
[Enrichment] Processing product: 123456789 - Milwaukee M18 FUEL Trapano
[Enrichment] Generating AI content for product 123456789
[Enrichment] Updated product 123456789 body_html and tags
[Enrichment] Created metafields for product 123456789
[Enrichment] Product 123456789 has no images, searching...
[ImageSearch] Found 5 images for query: "Milwaukee 4933479862"
[ImageSearch] Selected image: https://example.com/image.jpg
[ImageUpload] Adding image to product 123456789
[ImageUpload] Successfully added image 987654321 to product 123456789
[Enrichment] Successfully added 3 images to product 123456789
[Enrichment] Successfully enriched product 123456789 in 4520ms
```

## Gestione Errori

- Se l'AI fallisce, viene usato un contenuto di fallback generico
- Se la ricerca immagini fallisce, il prodotto viene comunque arricchito (solo senza immagini)
- Il webhook restituisce sempre 200 per evitare retry di Shopify
- Gli errori vengono loggati per debug

## Rate Limits

- Anthropic Claude: ~3000 tokens per richiesta
- Shopify Admin API: 40 requests/second (bucket)
- SerpAPI: Dipende dal piano (5000/mese con piano base)
- Tempo medio di elaborazione: 3-6 secondi per prodotto (con immagini)

## Costi Stimati

| Servizio | Costo per prodotto | Per 1000 prodotti |
|----------|-------------------|-------------------|
| Anthropic Claude | ~$0.01 | ~$10 |
| SerpAPI | ~$0.01 | ~$10 |
| **Totale** | ~$0.02 | ~$20 |

## File del Progetto

```
lib/shopify/
├── webhook-types.ts      # Tipi TypeScript
├── webhook-verify.ts     # Verifica HMAC Shopify
├── ai-enrichment.ts      # Generazione contenuti AI
├── admin-api.ts          # Shopify Admin API (metafields + immagini)
└── image-search.ts       # Ricerca immagini SerpAPI

app/api/webhooks/
└── enrich-product/
    └── route.ts          # Endpoint webhook principale
```
