# Danea Sync - Guida Integrazione

Questa guida spiega come sincronizzare i prodotti da Danea EasyFatt a Shopify tramite l'API di Autonord-shop.

---

## Panoramica

```
┌─────────────────────────────────────────────────────────────┐
│                      FLUSSO SYNC                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  DANEA EASYFATT                                             │
│       │                                                     │
│       ├── Opzione A: Export XML automatico (consigliato)    │
│       │   Strumenti → E-Commerce → Aggiorna articoli        │
│       │                                                     │
│       └── Opzione B: Export CSV manuale                     │
│           Magazzino → Articoli → Esporta                    │
│       │                                                     │
│       ▼                                                     │
│  POST /api/sync/danea/xml  (XML nativo)                     │
│  POST /api/sync/danea      (CSV)                            │
│       │                                                     │
│       ├── Parse XML/CSV                                     │
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

## Metodo 1: XML Nativo Danea (Consigliato)

Danea EasyFatt supporta nativamente l'invio XML via HTTP POST. Questo è il metodo più affidabile.

### Configurazione in Danea EasyFatt

1. Apri Danea EasyFatt
2. Vai su **Strumenti → E-Commerce → Aggiorna articoli**
3. Clicca sulla tab **Impostazioni**
4. Configura:
   - **URL**: `https://autonord-shop.vercel.app/api/sync/danea/xml?secret=TUO_SYNC_SECRET`
   - **Login**: (lascia vuoto se usi secret nell'URL)
   - **Password**: (lascia vuoto se usi secret nell'URL)
5. Clicca **Salva**

### Invio Prodotti

1. Vai su **Strumenti → E-Commerce → Aggiorna articoli**
2. Seleziona i prodotti da sincronizzare
3. Clicca **Invia**
4. Danea invierà automaticamente il file XML
5. Se ricevi "OK", la sincronizzazione è riuscita

### Modalità Sync

Danea supporta due modalità:

| Modalità | Descrizione | Quando Usarla |
|----------|-------------|---------------|
| **Full** | Invia tutti i prodotti | Prima sincronizzazione, reset completo |
| **Incremental** | Invia solo modifiche | Aggiornamenti quotidiani |

### Formato XML Danea

```xml
<?xml version="1.0" encoding="UTF-8"?>
<EasyfattProducts AppVersion="2" Mode="full" Warehouse="Negozio">
  <Products>
    <Product>
      <Code>4933479862</Code>
      <Description>TRAPANO MILWAUKEE M18 FPD3-502X</Description>
      <Category>Trapani</Category>
      <ProducerName>Milwaukee</ProducerName>
      <GrossPrice1>599.00</GrossPrice1>
      <AvailableQty>5</AvailableQty>
      <ImageFileName>milwaukee-m18.jpg</ImageFileName>
    </Product>
  </Products>
</EasyfattProducts>
```

### Campi XML Supportati

| Campo XML | Campo Shopify | Note |
|-----------|---------------|------|
| `Code` | SKU | **Obbligatorio** |
| `Description` | Title | Nome prodotto |
| `DescriptionHTML` | Body HTML | Descrizione formattata |
| `Category` | Product Type | Categoria |
| `ProducerName` | Vendor | Brand/Produttore |
| `GrossPrice1` | Price | Prezzo IVA inclusa |
| `NetPrice1` | Price | Prezzo netto (se GrossPrice assente) |
| `AvailableQty` | Inventory | Quantità disponibile |
| `Barcode` | Barcode | Codice a barre |
| `ImageFileName` | Images | Nome file immagine |
| `Notes` | Description | Note aggiuntive |

---

## Metodo 2: CSV Manuale

Se preferisci usare CSV invece di XML.

### Formato CSV Danea

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

### Upload CSV

```bash
curl -X POST https://autonord-shop.vercel.app/api/sync/danea \
  -H "Authorization: Bearer TUO_SYNC_SECRET" \
  -F "file=@prodotti.csv"
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
```

### Formato CSV Output

```csv
"Numero Ordine";"Cliente";"Email";"Totale";"Codice Prodotto";"Descrizione";"Quantità";"Prezzo Unitario"
"1001";"Mario Rossi";"mario@email.com";"599.00";"4933479862";"TRAPANO MILWAUKEE M18";"1";"599.00"
```

---

## Automazione con Script Batch

### Windows - sync-danea.bat

```batch
@echo off
set API_URL=https://autonord-shop.vercel.app/api/sync/danea/xml
set API_SECRET=TUO_SYNC_SECRET
set EXPORT_PATH=C:\Danea\Export\articoli.xml

REM Esporta da Danea (se supporta command line)
REM danea.exe /export /file:%EXPORT_PATH%

REM Invia a Shopify
curl -X POST "%API_URL%?secret=%API_SECRET%" ^
  -H "Content-Type: application/xml" ^
  --data-binary @%EXPORT_PATH%

echo Sync completato!
pause
```

Pianifica l'esecuzione con Task Scheduler di Windows.

---

## Troubleshooting

### Errore: Danea mostra errore dopo invio

- Verifica che l'URL sia corretto
- Verifica che il secret sia corretto
- Controlla i log su Vercel → Logs

### Errore: "No valid products found"

- Verifica che i prodotti abbiano il campo `Code` compilato
- Verifica che i prodotti siano marcati per e-commerce

### Errore: "Missing SHOPIFY_SHOP_DOMAIN"

- Aggiungi le variabili ambiente su Vercel
- Fai un nuovo deploy dopo aver aggiunto le variabili

### Errore: "Shopify API error: 429"

- Troppi prodotti in una volta
- Il sistema ha rate limiting (2 req/sec)
- Riprova con batch più piccoli

### Prodotti non visibili sul sito

- Verifica che il prodotto sia stato creato su Shopify Admin
- L'enrichment AI può richiedere qualche minuto
- Controlla i webhook su Shopify → Settings → Notifications

---

## Flusso Completo Go-Live

1. **Configura variabili ambiente** su Vercel (già fatto ✅)
2. **Configura Danea EasyFatt** con URL sync
3. **Invia prodotti** da Danea → Strumenti → E-Commerce → Aggiorna articoli
4. **Verifica** su Shopify Admin che i prodotti siano stati creati
5. **Attendi enrichment** (webhook automatico arricchisce i prodotti)
6. **Verifica frontend** che i prodotti siano visibili con descrizioni AI

---

## Endpoints Disponibili

| Endpoint | Metodo | Descrizione |
|----------|--------|-------------|
| `/api/sync/danea/xml` | POST | Riceve XML nativo da Danea EasyFatt |
| `/api/sync/danea` | POST | Riceve CSV prodotti |
| `/api/sync/danea/orders` | GET | Export ordini per Danea |

---

*Documentazione Danea Sync - Autonord Service - Gennaio 2026*
