# Danea Sync - Guida Integrazione

Questa guida spiega come sincronizzare i prodotti da Danea gestionale a Shopify tramite l'API di Autonord-shop.

---

## Panoramica

```
┌─────────────────────────────────────────────────────────────┐
│                      FLUSSO SYNC                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  DANEA GESTIONALE                                           │
│       │                                                     │
│       ▼                                                     │
│  Export CSV (manuale o automatico)                          │
│       │                                                     │
│       ▼                                                     │
│  POST /api/sync/danea                                       │
│       │                                                     │
│       ├── Parse CSV                                         │
│       ├── Filtra prodotti e-commerce                        │
│       └── Per ogni prodotto:                                │
│           ├── Cerca per SKU su Shopify                      │
│           ├── Se esiste → UPDATE                            │
│           └── Se non esiste → CREATE                        │
│                                                             │
│       ▼                                                     │
│  SHOPIFY                                                    │
│       │                                                     │
│       ▼                                                     │
│  Webhook products/create                                    │
│       │                                                     │
│       ▼                                                     │
│  ENRICHMENT AI (descrizioni, pro/contro, FAQ)               │
│       │                                                     │
│       ▼                                                     │
│  FRONTEND (prodotti arricchiti visibili)                    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Configurazione

### Variabili Ambiente Richieste

Aggiungi queste variabili su Vercel → Settings → Environment Variables:

```env
# Shopify Admin API (già configurate per enrichment)
SHOPIFY_SHOP_DOMAIN=tuonegozio.myshopify.com
SHOPIFY_ADMIN_ACCESS_TOKEN=shpat_xxxxx

# Opzionale: Protezione endpoint
SYNC_SECRET=una-password-segreta-lunga
```

---

## Formato CSV Danea

Il parser riconosce automaticamente le colonne standard di Danea:

| Colonna Danea | Campo Interno | Note |
|---------------|---------------|------|
| `Cod.` o `Codice` | daneaCode | **Obbligatorio** - SKU prodotto |
| `Descrizione` | title | Nome prodotto |
| `Categoria` | category | Categoria prodotto |
| `Listino 1` o `Prezzo` | price | Prezzo di vendita |
| `Listino 2` | compareAtPrice | Prezzo barrato |
| `Produttore` o `Brand` | manufacturer | Vendor su Shopify |
| `Q.tà in giacenza` | quantity | Stock disponibile |
| `Cod. a barre` o `EAN` | barcode | Codice a barre |
| `E-commerce` | ecommerce | Sì/No - se pubblicare |
| `Note` | description | Descrizione breve |
| `Prezzo forn.` | costPrice | Costo (non pubblicato) |

### Esempio CSV

```csv
Cod.;Descrizione;Categoria;Listino 1;Produttore;Q.tà in giacenza;E-commerce
4933479862;TRAPANO MILWAUKEE M18 FPD3-502X;Trapani;599,00;Milwaukee;5;Sì
DCD996B;TRAPANO DEWALT 20V MAX XR;Trapani;329,00;DeWalt;12;Sì
```

---

## Utilizzo API

### 1. Upload CSV (Multipart Form)

```bash
curl -X POST https://autonord-shop.vercel.app/api/sync/danea \
  -H "Authorization: Bearer TUO_SYNC_SECRET" \
  -F "file=@prodotti.csv"
```

### 2. Upload CSV (Raw Content)

```bash
curl -X POST https://autonord-shop.vercel.app/api/sync/danea \
  -H "Authorization: Bearer TUO_SYNC_SECRET" \
  -H "Content-Type: text/csv" \
  --data-binary @prodotti.csv
```

### 3. Upload CSV (JSON)

```bash
curl -X POST https://autonord-shop.vercel.app/api/sync/danea \
  -H "Authorization: Bearer TUO_SYNC_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"csv": "Cod.;Descrizione;Prezzo\n123;Prodotto Test;99,00"}'
```

### Risposta

```json
{
  "success": true,
  "message": "Sync completed successfully",
  "summary": {
    "total": 150,
    "created": 45,
    "updated": 100,
    "failed": 5,
    "skipped": 0
  },
  "errors": [
    "ABC123: Shopify API error: 422 - Invalid price format"
  ]
}
```

---

## Export Ordini per Danea

### Endpoint

```
GET /api/sync/danea/orders
```

### Parametri

| Parametro | Valori | Default | Descrizione |
|-----------|--------|---------|-------------|
| `status` | any, open, closed | any | Filtra per stato ordine |
| `limit` | 1-250 | 250 | Numero massimo ordini |
| `format` | csv, json | csv | Formato output |

### Esempio

```bash
# Download CSV ordini
curl -H "Authorization: Bearer TUO_SYNC_SECRET" \
  "https://autonord-shop.vercel.app/api/sync/danea/orders?status=open" \
  -o ordini.csv

# JSON per debug
curl -H "Authorization: Bearer TUO_SYNC_SECRET" \
  "https://autonord-shop.vercel.app/api/sync/danea/orders?format=json"
```

### Formato CSV Output

```csv
"Numero Ordine";"Cliente";"Email";"Totale";"Codice Prodotto";"Descrizione";"Quantità";"Prezzo Unitario"
"1001";"Mario Rossi";"mario@email.com";"599.00";"4933479862";"TRAPANO MILWAUKEE M18";"1";"599.00"
```

---

## Configurazione Danea

### Opzione A: Export Manuale

1. In Danea, vai su **Magazzino → Articoli**
2. Seleziona i prodotti da esportare
3. Clicca **Esporta → CSV**
4. Carica il file su `/api/sync/danea`

### Opzione B: Export Automatico (Schedulato)

Se Danea supporta export HTTP automatici:

1. Configura un task schedulato in Danea
2. URL destinazione: `https://autonord-shop.vercel.app/api/sync/danea`
3. Metodo: POST
4. Header: `Authorization: Bearer TUO_SYNC_SECRET`
5. Content-Type: `text/csv`

### Opzione C: Script Batch Windows

Crea un file `sync-danea.bat`:

```batch
@echo off
set EXPORT_PATH=C:\Danea\Export\prodotti.csv
set API_URL=https://autonord-shop.vercel.app/api/sync/danea
set API_SECRET=TUO_SYNC_SECRET

curl -X POST %API_URL% ^
  -H "Authorization: Bearer %API_SECRET%" ^
  -H "Content-Type: text/csv" ^
  --data-binary @%EXPORT_PATH%

echo Sync completato!
pause
```

Pianifica l'esecuzione con Task Scheduler di Windows.

---

## Troubleshooting

### Errore: "No valid products found in CSV"

- Verifica che le colonne abbiano i nomi corretti (vedi tabella sopra)
- Verifica che il delimitatore sia `;` o `,`
- Verifica che ci sia almeno la colonna `Cod.` o `Codice`

### Errore: "Missing SHOPIFY_SHOP_DOMAIN"

- Aggiungi le variabili ambiente su Vercel
- Fai un nuovo deploy dopo aver aggiunto le variabili

### Errore: "Shopify API error: 429"

- Troppi prodotti in una volta
- Il sistema ha rate limiting (2 req/sec)
- Riprova con batch più piccoli

### Prodotti non visibili sul sito

- Verifica che `E-commerce` sia "Sì" nel CSV
- Verifica che il prodotto sia stato creato su Shopify Admin
- L'enrichment AI può richiedere qualche minuto

---

## Flusso Completo Go-Live

1. **Configura variabili ambiente** su Vercel
2. **Esporta CSV** da Danea con tutti i prodotti e-commerce
3. **Carica CSV** tramite API o curl
4. **Verifica** su Shopify Admin che i prodotti siano stati creati
5. **Attendi enrichment** (webhook automatico arricchisce i prodotti)
6. **Verifica frontend** che i prodotti siano visibili con descrizioni AI

---

*Documentazione Danea Sync - Autonord Service - Gennaio 2026*
