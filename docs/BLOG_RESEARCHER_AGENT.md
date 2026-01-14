# Blog Researcher Agent

Agente automatico che cerca argomenti caldi sui forum e genera bozze di articoli "They Ask, You Answer".

## Panoramica

Ogni settimana (lunedì alle 8:00), questo agente:

1. **Cerca** discussioni su Reddit e forum di settore
2. **Analizza** i risultati per identificare "dolori ricorrenti"
3. **Genera** un articolo blog in stile TAYA con Claude
4. **Salva** la bozza su Shopify Blog (non pubblicata)
5. **Notifica** via Slack/Email per la revisione

## Architettura

```
┌─────────────────────────────────────────────────────────────┐
│                    BLOG RESEARCHER AGENT                    │
│                    (Vercel Cron Job)                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. SEARCH PHASE                                            │
│     ├── Reddit API                                          │
│     │   └── r/Tools, r/Construction, r/electricians...     │
│     └── Exa.ai (opzionale)                                 │
│         └── Forum di settore, blog tecnici                 │
│                                                             │
│  2. ANALYSIS PHASE (Claude)                                 │
│     ├── Raggruppa per tema                                 │
│     ├── Identifica dolori ricorrenti                       │
│     └── Seleziona miglior argomento                        │
│                                                             │
│  3. DRAFTING PHASE (Claude)                                 │
│     ├── Genera articolo TAYA                               │
│     │   ├── Titolo onesto                                  │
│     │   ├── Problema → Analisi → Verdetto                  │
│     │   └── 1500-2000 parole                               │
│     └── Formatta per Shopify                               │
│                                                             │
│  4. PUBLISHING PHASE                                        │
│     ├── Crea bozza su Shopify Blog                         │
│     └── Invia notifica (Slack/Email)                       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## File del Progetto

```
lib/blog-researcher/
├── index.ts           # Export principale
├── search.ts          # Ricerca Reddit e forum
├── analysis.ts        # Analisi AI dei topic
├── drafting.ts        # Generazione articoli
├── shopify-blog.ts    # Integrazione Shopify Blog API
└── notifications.ts   # Sistema notifiche

app/api/cron/
└── blog-researcher/
    └── route.ts       # Endpoint cron job
```

## Variabili d'Ambiente

```env
# Già configurate (Product Enrichment Agent)
ANTHROPIC_API_KEY=sk-ant-xxxxx
SHOPIFY_SHOP_DOMAIN=tuonegozio.myshopify.com
SHOPIFY_ADMIN_ACCESS_TOKEN=shpat_xxxxx

# Opzionali - Ricerca estesa
EXA_API_KEY=xxxxx                    # Per ricerca web avanzata

# Notifiche (almeno uno)
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/xxx
NOTIFICATION_EMAIL=tuo@email.com
RESEND_API_KEY=re_xxxxx              # Per invio email

# Sicurezza cron
CRON_SECRET=xxxxx                    # Opzionale, per proteggere endpoint
```

## Configurazione Vercel Cron

Il file `vercel.json` configura l'esecuzione automatica:

```json
{
  "crons": [
    {
      "path": "/api/cron/blog-researcher",
      "schedule": "0 8 * * 1"
    }
  ]
}
```

**Schedule:** `0 8 * * 1` = Ogni lunedì alle 8:00 UTC

Per cambiare la frequenza:
- `0 8 * * *` = Ogni giorno alle 8:00
- `0 8 * * 1,4` = Lunedì e giovedì alle 8:00
- `0 8 1 * *` = Primo giorno del mese alle 8:00

## Subreddit Monitorati

| Subreddit | Focus |
|-----------|-------|
| r/Tools | Discussioni generali su utensili |
| r/Construction | Professionisti edilizia |
| r/electricians | Elettricisti |
| r/Plumbing | Idraulici |
| r/HVAC | Tecnici climatizzazione |
| r/Carpentry | Falegnami |
| r/HomeImprovement | DIY avanzato |
| r/MilwaukeeTool | Fan Milwaukee |
| r/Makita | Fan Makita |
| r/DeWalt | Fan DeWalt |

## Categorie TAYA (Big 5)

L'agente classifica ogni argomento in una delle 5 categorie TAYA:

| Categoria | Descrizione | Esempio |
|-----------|-------------|---------|
| **pricing** | Domande su costi e valore | "Vale la pena spendere €600 per un trapano Milwaukee?" |
| **problems** | Problemi e difetti comuni | "Le batterie M18 si scaricano troppo velocemente" |
| **comparisons** | Confronti tra brand/modelli | "Milwaukee vs Makita: quale scegliere?" |
| **reviews** | Recensioni oneste | "Dopo 2 anni con il DeWalt DCD996, ecco cosa penso" |
| **best** | "Qual è il migliore per..." | "Miglior avvitatore a impulsi per gommisti" |

## Struttura Articolo Generato

```html
<article>
  <h2>Il Problema</h2>
  <p>Descrizione del dolore del cliente...</p>
  
  <h2>Analisi Tecnica</h2>
  <p>Spiegazione dettagliata...</p>
  
  <h2>Confronto Pratico</h2>
  <p>Dati e test reali...</p>
  
  <h2>Il Nostro Verdetto</h2>
  <p>Conclusione imparziale...</p>
  
  <h3>Per Chi È Adatto</h3>
  <ul>
    <li>Profilo ideale 1</li>
    <li>Profilo ideale 2</li>
  </ul>
  
  <h3>Per Chi NON È Adatto</h3>
  <ul>
    <li>Profilo non ideale 1</li>
    <li>Profilo non ideale 2</li>
  </ul>
</article>
```

## Test Manuale

Per testare l'agente manualmente:

```bash
# Trigger via curl
curl -X POST https://autonord-shop.vercel.app/api/cron/blog-researcher \
  -H "Authorization: Bearer YOUR_CRON_SECRET"

# Oppure in sviluppo locale
curl http://localhost:3000/api/cron/blog-researcher
```

## Risposta API

```json
{
  "success": true,
  "article": {
    "id": 123456789,
    "title": "Quanto Durano le Batterie Milwaukee M18? Test Reale",
    "slug": "durata-batterie-milwaukee-m18-test",
    "category": "Guide",
    "readTime": 8,
    "tags": ["milwaukee", "batterie", "test"]
  },
  "topic": {
    "name": "Durata Batterie Milwaukee M18",
    "painPoint": "Le batterie 5Ah durano meno del previsto su utensili ad alto consumo",
    "tayaCategory": "problems"
  },
  "search": {
    "totalResults": 127,
    "topicsIdentified": 8
  },
  "notifications": {
    "sent": 2,
    "channels": ["slack", "email"]
  },
  "processingTime": "45230ms"
}
```

## Notifica Slack

Quando viene creata una bozza, ricevi una notifica Slack con:

- Titolo dell'articolo
- Categoria e tempo di lettura
- Anteprima del contenuto
- Pulsante per aprire la bozza su Shopify

## Workflow di Revisione

1. **Ricevi notifica** (Slack o Email)
2. **Apri la bozza** su Shopify Admin
3. **Revisiona il contenuto**:
   - Verifica accuratezza tecnica
   - Aggiungi esperienze personali
   - Inserisci link a prodotti
   - Aggiungi immagini
4. **Pubblica** quando pronto

## Costi Stimati

| Servizio | Costo per Articolo | Mensile (4 articoli) |
|----------|-------------------|---------------------|
| Claude (analisi + drafting) | ~$0.05 | ~$0.20 |
| Exa.ai (opzionale) | ~$0.01 | ~$0.04 |
| Reddit API | Gratuito | Gratuito |
| Vercel Cron | Gratuito (Hobby) | Gratuito |
| **Totale** | ~$0.06 | ~$0.25 |

## Permessi Shopify Richiesti

L'app Shopify deve avere questi scope aggiuntivi:

- `read_content` - Per leggere blog esistenti
- `write_content` - Per creare articoli

## Troubleshooting

### "No relevant topics found"
- Normale se i subreddit sono poco attivi
- Prova ad aggiungere più subreddit in `search.ts`

### "Shopify API error 403"
- Verifica che l'app abbia i permessi `write_content`
- Rigenera l'access token se necessario

### "Claude rate limit"
- L'agente usa ~3000 token per esecuzione
- Non dovrebbe superare i limiti standard

### Notifiche non arrivano
- Verifica `SLACK_WEBHOOK_URL` o `RESEND_API_KEY`
- Controlla i log su Vercel per errori specifici
