# Checklist Go-Live Autonord E-commerce

Questa checklist ti guida passo-passo per portare il sito in produzione.

---

## Stato Attuale del Codice

### ✅ Già Implementato

| Funzionalità | Stato | Note |
|--------------|-------|------|
| Homepage | ✅ Completo | Hero, categorie, prodotti in evidenza |
| Catalogo prodotti | ✅ Completo | Griglia, filtri, ordinamento |
| Pagina prodotto | ✅ Completo | Immagini, prezzo, stock, descrizione |
| Checkout | ✅ Completo | Redirect a Shopify Checkout |
| Pulsante Acquista | ✅ Completo | Buy Now + Add to Cart |
| Ricerca | ✅ Completo | Ricerca full-text prodotti |
| Blog | ✅ Completo | Lista articoli + pagina singola |
| Pagine legali | ✅ Completo | Privacy, Termini, Spedizioni, Garanzia |
| SEO | ✅ Completo | Meta tags, Schema.org, sitemap |
| Mobile responsive | ✅ Completo | Design mobile-first |
| Product Enrichment Agent | ✅ Completo | Webhook per arricchimento AI |
| Blog Researcher Agent | ✅ Completo | Cron job per articoli automatici |

### ⚠️ Da Configurare (Non Codice)

| Elemento | Azione Richiesta |
|----------|------------------|
| Variabili ambiente Vercel | Configurare tutte le API keys |
| Shopify App Custom | Creare app e ottenere token |
| Webhook Shopify | Registrare endpoint enrichment |
| Dominio | Collegare dominio custom (opzionale) |

### 🔶 Opzionale / Miglioramenti Futuri

| Funzionalità | Priorità | Note |
|--------------|----------|------|
| Carrello persistente | Media | Attualmente redirect diretto a checkout |
| Account utente | Bassa | Shopify gestisce login |
| Wishlist | Bassa | Nice to have |
| Recensioni prodotto | Media | Integrabile con Shopify Reviews |
| Chat live | Bassa | Integrabile con Tidio/Crisp |

---

## FASE 1: Abbonamenti e Account (1-2 ore)

### 1.1 Shopify Basic
- [ ] Vai su https://www.shopify.com/it
- [ ] Attiva piano **Basic** (€28/mese)
- [ ] Completa la configurazione iniziale del negozio
- [ ] Nota: Il trial gratuito non permette vendite reali

### 1.2 Vercel Pro
- [ ] Vai su https://vercel.com/dashboard
- [ ] Clicca sul tuo progetto → Settings → Billing
- [ ] Upgrade a **Pro** ($20/mese)
- [ ] Nota: Hobby non è consentito per uso commerciale

### 1.3 Anthropic Claude
- [ ] Vai su https://console.anthropic.com
- [ ] Crea account se non l'hai già
- [ ] Vai su Settings → Billing → Add credits
- [ ] Aggiungi almeno $50 per iniziare
- [ ] Vai su API Keys → Create Key
- [ ] Copia la chiave: `sk-ant-...`

### 1.4 SerpAPI (Opzionale - per immagini automatiche)
- [ ] Vai su https://serpapi.com
- [ ] Crea account (100 ricerche/mese gratis)
- [ ] Copia API key dalla dashboard

---

## FASE 2: Configurazione Shopify (2-3 ore)

### 2.1 Impostazioni Base
- [ ] Shopify Admin → Settings → Store details
  - [ ] Nome negozio: "Autonord Service"
  - [ ] Email: tua email
  - [ ] Indirizzo: Lungobisagno d'Istria 34, Genova
  - [ ] Telefono: 010 7456076

### 2.2 Pagamenti
- [ ] Settings → Payments
- [ ] Attiva **Shopify Payments** (Stripe integrato)
  - [ ] Inserisci dati aziendali
  - [ ] Collega conto bancario
- [ ] Attiva **PayPal** (opzionale)
- [ ] Attiva **Bonifico Bancario** (manuale)

### 2.3 Spedizioni
- [ ] Settings → Shipping and delivery
- [ ] Crea zona "Italia"
- [ ] Configura tariffe:
  - [ ] Spedizione standard: €X (o gratis sopra €Y)
  - [ ] Spedizione express: €X
  - [ ] Ritiro in sede: Gratis

### 2.4 Tasse
- [ ] Settings → Taxes and duties
- [ ] Configura IVA Italia (22%)
- [ ] Abilita "Mostra prezzi IVA inclusa" o esclusa (B2B = esclusa)

### 2.5 Checkout
- [ ] Settings → Checkout
- [ ] Personalizza colori per match con brand Autonord
- [ ] Abilita checkout ospite (senza registrazione)

### 2.6 Notifiche Email
- [ ] Settings → Notifications
- [ ] Personalizza template email con logo Autonord
- [ ] Testa invio email di conferma ordine

---

## FASE 3: Creare App Shopify Custom (30 min)

### 3.1 Crea App
- [ ] Shopify Admin → Settings → Apps and sales channels
- [ ] Clicca "Develop apps" (in alto a destra)
- [ ] Clicca "Allow custom app development" se richiesto
- [ ] Clicca "Create an app"
- [ ] Nome: "Autonord Enrichment Agent"

### 3.2 Configura Permessi API
- [ ] Vai su "Configuration" → "Admin API integration"
- [ ] Clicca "Configure"
- [ ] Seleziona questi scope:
  - [x] `read_products`
  - [x] `write_products`
  - [x] `read_content`
  - [x] `write_content`
- [ ] Clicca "Save"

### 3.3 Installa e Ottieni Token
- [ ] Clicca "Install app"
- [ ] Conferma installazione
- [ ] Vai su "API credentials"
- [ ] Copia **Admin API access token**: `shpat_...`
- [ ] ⚠️ IMPORTANTE: Questo token viene mostrato UNA SOLA VOLTA

---

## FASE 4: Configurare Webhook Enrichment (15 min)

### 4.1 Crea Webhook
- [ ] Shopify Admin → Settings → Notifications
- [ ] Scorri fino a "Webhooks"
- [ ] Clicca "Create webhook"
- [ ] Configura:
  - Event: **Product creation**
  - Format: **JSON**
  - URL: `https://autonord-shop.vercel.app/api/webhooks/enrich-product`
  - API version: **2024-01**
- [ ] Clicca "Save"

### 4.2 Copia Webhook Secret
- [ ] Clicca sul webhook appena creato
- [ ] Copia il **Webhook secret**: `whsec_...`

---

## FASE 5: Configurare Variabili Ambiente Vercel (15 min)

### 5.1 Accedi a Vercel
- [ ] Vai su https://vercel.com
- [ ] Seleziona il progetto "autonord-shop"
- [ ] Vai su Settings → Environment Variables

### 5.2 Aggiungi Variabili
Aggiungi queste variabili per **Production**, **Preview**, e **Development**:

```
# Shopify Storefront (già configurate probabilmente)
NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN=tuonegozio.myshopify.com
NEXT_PUBLIC_SHOPIFY_STOREFRONT_ACCESS_TOKEN=xxxxx

# Shopify Admin (per Enrichment Agent)
SHOPIFY_SHOP_DOMAIN=tuonegozio.myshopify.com
SHOPIFY_ADMIN_ACCESS_TOKEN=shpat_xxxxx
SHOPIFY_WEBHOOK_SECRET=whsec_xxxxx

# AI (Claude)
ANTHROPIC_API_KEY=sk-ant-xxxxx

# Immagini (opzionale)
SERPAPI_API_KEY=xxxxx

# Notifiche Blog Agent (almeno uno)
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/xxx
# oppure
NOTIFICATION_EMAIL=tuo@email.com
RESEND_API_KEY=re_xxxxx
```

### 5.3 Redeploy
- [ ] Dopo aver aggiunto le variabili, vai su Deployments
- [ ] Clicca sui tre puntini del deployment più recente
- [ ] Clicca "Redeploy"

---

## FASE 6: Import Prodotti dal Gestionale (1-2 ore)

### 6.1 Prepara CSV
Esporta dal gestionale un CSV con queste colonne:

```csv
Handle,Title,Body (HTML),Vendor,Type,Tags,Published,Variant SKU,Variant Price,Variant Inventory Qty
trapano-milwaukee-m18,TRAPANO MILWAUKEE M18 FPD3-502X,,TECHTRONIC INDUSTRIES ITALIA SRL,Trapani,Milwaukee,TRUE,4933479862,599.00,5
```

Colonne minime richieste:
- **Handle**: URL slug (es. "trapano-milwaukee-m18")
- **Title**: Nome prodotto
- **Vendor**: Nome fornitore (verrà normalizzato dall'agent)
- **Variant SKU**: Codice articolo
- **Variant Price**: Prezzo (senza IVA)
- **Variant Inventory Qty**: Quantità in stock

### 6.2 Importa su Shopify
- [ ] Shopify Admin → Products → Import
- [ ] Carica il file CSV
- [ ] Mappa le colonne se necessario
- [ ] Avvia import

### 6.3 Monitora Enrichment
- [ ] Ogni prodotto creato attiverà il webhook
- [ ] L'agent arricchirà automaticamente:
  - Descrizione TAYA
  - Pro e Contro
  - FAQ
  - Immagini (se SerpAPI configurato)
- [ ] Controlla i log su Vercel → Logs
- [ ] Tempo stimato: ~5 secondi per prodotto
- [ ] Per 2000 prodotti: ~3 ore (automatiche)

---

## FASE 7: Dominio Custom (Opzionale - 30 min)

### 7.1 Opzione A: Usa Dominio Esistente
- [ ] Vai su Vercel → Settings → Domains
- [ ] Aggiungi il tuo dominio (es. shop.autonordservice.com)
- [ ] Configura DNS come indicato da Vercel

### 7.2 Opzione B: Acquista Nuovo Dominio
- [ ] Puoi acquistare direttamente da Vercel
- [ ] Oppure da Namecheap/GoDaddy e collegare

---

## FASE 8: Test Pre-Lancio (1-2 ore)

### 8.1 Test Funzionali
- [ ] Naviga il catalogo prodotti
- [ ] Apri una pagina prodotto
- [ ] Clicca "Acquista Ora"
- [ ] Verifica redirect a Shopify Checkout
- [ ] Completa un ordine di test (usa carta test Shopify)
- [ ] Verifica email di conferma

### 8.2 Test Mobile
- [ ] Apri il sito da smartphone
- [ ] Naviga il catalogo
- [ ] Verifica sticky CTA in basso
- [ ] Completa un acquisto

### 8.3 Test SEO
- [ ] Verifica meta tags con https://metatags.io
- [ ] Verifica Schema.org con https://validator.schema.org
- [ ] Verifica sitemap: /sitemap.xml

### 8.4 Test Performance
- [ ] Testa con https://pagespeed.web.dev
- [ ] Target: 90+ su Mobile e Desktop

---

## FASE 9: Lancio! 🚀

### 9.1 Checklist Finale
- [ ] Tutti i prodotti importati
- [ ] Enrichment completato (controlla tag "AI-Enhanced")
- [ ] Pagamenti configurati e testati
- [ ] Spedizioni configurate
- [ ] Email di conferma funzionanti
- [ ] Dominio collegato (se custom)

### 9.2 Go Live
- [ ] Rimuovi eventuali password di protezione
- [ ] Annuncia sui social
- [ ] Invia email ai clienti esistenti
- [ ] Monitora ordini e log per le prime 24-48 ore

---

## Supporto e Troubleshooting

### Log e Monitoraggio
- **Vercel Logs**: https://vercel.com → Progetto → Logs
- **Shopify Ordini**: Shopify Admin → Orders
- **Webhook Errors**: Shopify Admin → Settings → Notifications → Webhooks

### Problemi Comuni

**Enrichment non funziona:**
1. Verifica che il webhook sia attivo in Shopify
2. Controlla i log Vercel per errori
3. Verifica che ANTHROPIC_API_KEY sia configurata

**Checkout non funziona:**
1. Verifica che Shopify Payments sia attivo
2. Controlla che il prodotto sia "Available for sale"
3. Verifica i log del browser (F12 → Console)

**Immagini non caricate:**
1. Verifica SERPAPI_API_KEY
2. Controlla i log per errori di ricerca
3. Puoi caricare immagini manualmente su Shopify

---

## Costi Mensili Ricorrenti

| Servizio | Costo |
|----------|-------|
| Shopify Basic | €28/mese |
| Vercel Pro | $20/mese (~€18) |
| Anthropic Claude | Pay-as-you-go (~€5-10/mese dopo setup iniziale) |
| SerpAPI | €0 (piano free) o $75/mese |
| **Totale minimo** | **~€50/mese** |

---

## Contatti Utili

- **Shopify Support**: https://help.shopify.com
- **Vercel Support**: https://vercel.com/support
- **Anthropic Docs**: https://docs.anthropic.com

---

*Checklist creata per Autonord Service - Ultimo aggiornamento: Gennaio 2026*
