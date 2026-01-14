# Shopify Product Enrichment Agent

Agente automatico che arricchisce i prodotti Shopify con contenuti TAYA-style generati da AI.

## Panoramica

Quando il gestionale crea un nuovo prodotto su Shopify (con solo dati grezzi: SKU, Prezzo, Titolo, EAN), questo webhook:

1. **Riceve** il payload del prodotto via webhook `products/create`
2. **Verifica** l'autenticità con HMAC
3. **Controlla** se il prodotto è già arricchito (tag `AI-Enhanced`)
4. **Genera** contenuti con OpenAI (GPT-4o):
   - Descrizione TAYA-style (focus sui problemi risolti)
   - 3 PRO tecnici specifici
   - 2 CONTRO onesti
   - 3 FAQ tecniche
5. **Aggiorna** Shopify senza toccare i dati del gestionale

## Campi Modificati

| Campo | Azione |
|-------|--------|
| `body_html` | Sostituito con descrizione AI + Pro/Contro + FAQ |
| `tags` | Aggiunto `AI-Enhanced` |
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

# OpenAI
OPENAI_API_KEY=sk-xxxxxxxxxxxxx
```

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
- `write_products` - Per aggiornare body_html e tags
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
  -d '{"id": 123, "title": "Test Product", "vendor": "Milwaukee", "tags": "", "variants": [{"sku": "TEST-001"}]}'
```

## Logging

Tutti i log usano il prefisso `[Enrichment]` per facile filtraggio:

```
[Enrichment] Received webhook from store.myshopify.com, topic: products/create
[Enrichment] Processing product: 123456789 - Milwaukee M18 FUEL Trapano
[Enrichment] Generating AI content for product 123456789
[Enrichment] Updated product 123456789 body_html and tags
[Enrichment] Created metafields for product 123456789
[Enrichment] Successfully enriched product 123456789 in 2340ms
```

## Gestione Errori

- Se l'AI fallisce, viene usato un contenuto di fallback generico
- Il webhook restituisce sempre 200 per evitare retry di Shopify
- Gli errori vengono loggati per debug

## Rate Limits

- OpenAI: ~3000 tokens per richiesta (GPT-4o)
- Shopify Admin API: 40 requests/second (bucket)
- Tempo medio di elaborazione: 2-4 secondi per prodotto

## Costi Stimati

- OpenAI GPT-4o: ~$0.01-0.02 per prodotto
- Per 1000 prodotti: ~$10-20
