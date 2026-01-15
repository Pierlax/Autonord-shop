# Blog Researcher V2 - Documentazione

## Panoramica

Il Blog Researcher V2 è un upgrade significativo dell'Agente 2, progettato per generare articoli di alta qualità seguendo la metodologia TAYA (They Ask You Answer).

## Nuove Funzionalità

### 1. Whitelist Fonti Tecniche

Il sistema ora prioritizza fonti autorevoli per i dati tecnici:

| Fonte | Tipo | Priorità | Dati |
|-------|------|----------|------|
| protoolreviews.com | Tecnico | 10 | Benchmark, test runtime, teardown |
| toolguyd.com | Review | 9 | Analisi feature, hands-on |
| tooltalk.com | Community | 8 | Opinioni reali, durabilità |

### 2. Sentiment Analysis Forum

Analisi automatica delle opinioni da:

**Forum Inglesi:**
- Reddit r/Tools, r/MilwaukeeTool, r/Makita, r/DeWalt
- Garage Journal
- Contractor Talk

**Forum Italiani:**
- PLC Forum Italia
- Forum Macchine
- ElectroYou

**Query Pattern:**
- `{prodotto} problemi`
- `{prodotto} guasto`
- `opinioni {prodotto}`
- `{prodotto} vs {competitor}`

### 3. Struttura Articolo Obbligatoria

Ogni articolo DEVE contenere:

1. **Introduzione** - Hook che parte dal problema
2. **Tabella Specifiche Tecniche** - Dati numerici da fonti whitelist
3. **Cosa Dicono nei Cantieri** - Citazioni reali dai forum
4. **Pro e Contro** - Lista onesta con almeno 3 contro
5. **Il Verdetto di Autonord** - Opinione chiara e sbilanciata

### 4. Validazione Automatica

Il sistema valida ogni articolo:

- ✅ Presenza sezioni obbligatorie
- ✅ Minimo parole per sezione
- ✅ Presenza tabella specifiche (min 5 righe)
- ✅ Citazioni forum (min 3)
- ✅ Fonti whitelist citate
- ✅ Verdetto con "Ideale per" e "Non ideale per"

---

## File Struttura

```
lib/blog-researcher/
├── index.ts              # Exports principali
├── sources.ts            # Configurazione whitelist e forum
├── sentiment.ts          # Analisi sentiment con Claude
├── article-template.ts   # Template e validazione
├── drafting-v2.ts        # Generazione articoli potenziata
├── drafting.ts           # Versione legacy (mantenuta)
├── search.ts             # Ricerca Reddit
├── analysis.ts           # Analisi topic
├── shopify-blog.ts       # Integrazione Shopify
└── notifications.ts      # Notifiche
```

---

## Utilizzo

### Generare un Singolo Articolo

```typescript
import { generateEnhancedArticle } from './lib/blog-researcher';

const topic = {
  topic: 'Milwaukee M18 FUEL vs Makita 40V XGT',
  painPoint: 'Quale ecosistema scegliere?',
  articleAngle: 'comparison',
  targetAudience: 'Elettricisti professionisti',
  tayaCategory: 'Confronti',
  samplePosts: [],
  priority: 1,
};

const article = await generateEnhancedArticle(topic, 'comparison');
```

### Generare il Pacchetto Lancio

```bash
# Richiede ANTHROPIC_API_KEY configurata
npx tsx scripts/generate-launch-articles.ts
```

Output:
- `content/launch-articles/{slug}.html` - Articolo HTML
- `content/launch-articles/{slug}.json` - Metadata
- `content/launch-articles/SUMMARY.md` - Report

---

## Pacchetto Lancio (5 Articoli)

| # | Titolo | Tipo |
|---|--------|------|
| 1 | Milwaukee M18 FUEL vs Makita 40V XGT - Avvitatori a impulsi | Confronto |
| 2 | DeWalt vs Milwaukee - Trapani a percussione | Confronto |
| 3 | Batterie Milwaukee che si scaricano velocemente | Problema |
| 4 | Hilti TE 30-A36 - Vale il prezzo premium? | Recensione |
| 5 | Come scegliere il miglior avvitatore per elettricisti | Guida |

---

## Configurazione

### Variabili Ambiente Richieste

```env
ANTHROPIC_API_KEY=sk-ant-...     # Obbligatorio
SERPAPI_API_KEY=...              # Opzionale (forum italiani)
EXA_API_KEY=...                  # Opzionale (ricerca avanzata)
```

### Cron Job

Il Blog Researcher gira automaticamente ogni lunedì alle 8:00 (configurato in `vercel.json`).

---

## Output Esempio

### Tabella Specifiche

```html
<table>
  <thead>
    <tr>
      <th>Specifica</th>
      <th>Milwaukee M18 FUEL</th>
      <th>Makita 40V XGT</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>Coppia massima (Nm)</td>
      <td class="text-green-400">1356 ✓</td>
      <td>1250</td>
    </tr>
    ...
  </tbody>
</table>
```

### Citazioni Forum

```html
<blockquote class="border-l-4 border-green-500">
  <p>"Ho usato entrambi per 2 anni. Milwaukee vince per durabilità."</p>
  <footer>— reddit.com/r/Tools</footer>
</blockquote>
```

### Verdetto

```html
<section class="bg-gradient-to-r from-amber-900/20 to-zinc-900">
  <h2>🎯 Il Verdetto di Autonord</h2>
  <p>Per l'elettricista che fa 50+ punti luce al giorno, Milwaukee M18 FUEL 
     è la scelta migliore per coppia e durabilità. Makita 40V XGT è preferibile 
     se hai già un parco batterie Makita.</p>
  
  <div class="inline-block bg-amber-500 text-black font-bold px-4 py-2">
    VINCITORE: Milwaukee M18 FUEL
  </div>
</section>
```

---

## Integrazione con TAYA Director

Il TAYA Director (Agente 3) può:

1. **Commissionare articoli** al Blog Researcher
2. **Valutare qualità** degli articoli generati
3. **Richiedere riscrittura** se non rispettano standard TAYA

---

## Troubleshooting

### Errore: "ANTHROPIC_API_KEY not set"
Configura la variabile ambiente su Vercel o nel file `.env.local`.

### Articoli troppo corti
Il sistema genera warning se < 1200 parole. Aumenta `max_tokens` in `drafting-v2.ts`.

### Nessuna citazione forum
Verifica che Reddit sia raggiungibile. I forum italiani richiedono `SERPAPI_API_KEY`.

---

*Documentazione aggiornata: Gennaio 2026*
