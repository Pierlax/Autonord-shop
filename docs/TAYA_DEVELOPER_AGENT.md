# Autonomous TAYA Developer Agent

Questo agent usa **Claude Opus 4.1** con i tool nativi (Bash + Text Editor) per scansionare automaticamente il codice, identificare violazioni dei principi "They Ask You Answer", e creare Pull Request con le correzioni.

---

## Come Funziona

```
┌─────────────────────────────────────────────────────────────┐
│  GitHub Action (trigger: manuale o ogni lunedì)            │
│                                                             │
│  1. Checkout repository                                     │
│  2. Crea branch: taya-improvement-{timestamp}               │
│  3. Esegue scripts/taya-improver.ts                         │
│       │                                                     │
│       ▼                                                     │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Claude Opus 4.1 API                                │   │
│  │                                                     │   │
│  │  Tools disponibili:                                 │   │
│  │  ├── bash_20250124: comandi shell                   │   │
│  │  └── text_editor_20250728: leggi/modifica file      │   │
│  │                                                     │   │
│  │  Loop:                                              │   │
│  │  1. Legge TAYA_RULES.md                             │   │
│  │  2. Scansiona /app e /components                    │   │
│  │  3. Identifica UNA violazione                       │   │
│  │  4. Modifica il codice                              │   │
│  │  5. Esegue pnpm run build                           │   │
│  │  6. Se fallisce → corregge e riprova                │   │
│  └─────────────────────────────────────────────────────┘   │
│       │                                                     │
│       ▼                                                     │
│  4. git commit -m "refactor(taya): ..."                     │
│  5. git push origin {branch}                                │
│  6. gh pr create                                            │
│                                                             │
└─────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────┐
│  Pull Request   │
│  pronta per     │
│  review         │
└─────────────────┘
```

---

## File del Progetto

| File | Descrizione |
|------|-------------|
| `TAYA_RULES.md` | Le 10 regole TAYA che il codice deve rispettare |
| `scripts/taya-improver.ts` | Script Node.js che chiama Claude API |
| `.github/workflows/taya-improver.yml` | GitHub Action per esecuzione automatica |

---

## Configurazione

### 1. Aggiungi il Secret su GitHub

1. Vai su **GitHub → Repository → Settings → Secrets and variables → Actions**
2. Clicca **New repository secret**
3. Nome: `ANTHROPIC_API_KEY`
4. Valore: la tua API key di Anthropic (inizia con `sk-ant-...`)

### 2. Abilita GitHub Actions

Le Actions dovrebbero essere già abilitate. Verifica in:
**Settings → Actions → General → Allow all actions**

---

## Esecuzione

### Manuale

1. Vai su **GitHub → Repository → Actions**
2. Seleziona **"Autonomous TAYA Developer"**
3. Clicca **"Run workflow"**
4. Opzionale: spunta "Dry run" per testare senza creare PR

### Automatica

Il workflow si esegue automaticamente **ogni lunedì alle 9:00 UTC**.

Puoi modificare la schedule in `.github/workflows/taya-improver.yml`:

```yaml
schedule:
  - cron: '0 9 * * 1'  # Lunedì 9:00 UTC
```

### Locale (per test)

```bash
# Dalla root del progetto
export ANTHROPIC_API_KEY=sk-ant-xxxxx
npx tsx scripts/taya-improver.ts
```

---

## Le 10 Regole TAYA

L'agent verifica queste regole (vedi `TAYA_RULES.md` per dettagli):

| # | Regola | Priorità |
|---|--------|----------|
| 1 | Trasparenza sui Prezzi | Critica |
| 2 | Pro e Contro Onesti | Alta |
| 3 | Contenuti Educativi in Primo Piano | Alta |
| 4 | Niente "Corporate Fluff" | Alta |
| 5 | Domande Frequenti Reali | Media |
| 6 | Confronti Diretti | Media |
| 7 | Disponibilità e Stock Chiari | Alta |
| 8 | Call-to-Action Oneste | Media |
| 9 | Contatti Sempre Accessibili | Media |
| 10 | Mobile-First con Sostanza | Bassa |

---

## Costi

| Componente | Costo Stimato |
|------------|---------------|
| Claude Opus 4.1 per esecuzione | ~$0.50 - $2.00 |
| GitHub Actions | Gratuito (2000 min/mese) |
| **Totale mensile** (4 esecuzioni) | **~$2 - $8** |

---

## Sicurezza

### Limiti di Sicurezza

Lo script ha diversi limiti di sicurezza:

1. **Max 20 iterazioni** per esecuzione (evita loop infiniti)
2. **Timeout 60 secondi** per comando bash
3. **Solo UNA modifica** per esecuzione
4. **Build verification** prima del commit

### Comandi Bash Permessi

L'agent può eseguire qualsiasi comando, ma è progettato per usare solo:
- `git` (checkout, commit, push)
- `pnpm` (build, install)
- `ls`, `cat`, `find` (esplorazione file)
- `gh` (creazione PR)

### Review Obbligatoria

Le PR create dall'agent **non vengono mergiate automaticamente**. Un umano deve sempre:
1. Revieware le modifiche
2. Testare localmente se necessario
3. Approvare e mergiare

---

## Troubleshooting

### L'agent non trova violazioni

Possibili cause:
- Il codice è già conforme alle regole TAYA
- L'agent ha bisogno di più contesto (modifica il prompt)

### Il build fallisce dopo la modifica

L'agent tenterà automaticamente di correggere l'errore. Se fallisce dopo 3 tentativi, il workflow si interrompe senza creare PR.

### Rate limit API

Se raggiungi il rate limit di Anthropic, l'agent attende 60 secondi e riprova.

### La PR non viene creata

Verifica che:
1. `ANTHROPIC_API_KEY` sia configurato correttamente
2. Il repository abbia i permessi per Actions
3. Non ci siano conflitti con branch esistenti

---

## Personalizzazione

### Modificare le Regole

Edita `TAYA_RULES.md` per aggiungere, rimuovere o modificare regole.

### Modificare la Frequenza

Edita il cron in `.github/workflows/taya-improver.yml`:

```yaml
# Ogni giorno alle 8:00
- cron: '0 8 * * *'

# Ogni venerdì alle 17:00
- cron: '0 17 * * 5'

# Due volte a settimana (lunedì e giovedì)
- cron: '0 9 * * 1,4'
```

### Modificare il Modello

In `scripts/taya-improver.ts`, cambia:

```typescript
const MODEL = 'claude-opus-4-1-20250805';
```

Modelli disponibili:
- `claude-opus-4-1-20250805` (più potente, più costoso)
- `claude-sonnet-4-20250514` (buon compromesso)
- `claude-haiku-4-5-20251001` (più veloce, meno costoso)

---

## Esempio di Output

```
🚀 Avvio Autonomous TAYA Developer
📁 Working directory: /home/runner/work/Autonord-shop/Autonord-shop
🤖 Model: claude-opus-4-1-20250805
────────────────────────────────────────────────────────────

════════════════════════════════════════════════════════════
📍 Iterazione 1/20
════════════════════════════════════════════════════════════

📦 Tool: str_replace_based_edit_tool
   Input: {"command":"view","path":"TAYA_RULES.md"}...

💬 Claude:
Ho letto le regole TAYA. Ora scansiono i file principali...

📦 Tool: bash
   Input: {"command":"find ./app -name '*.tsx' | head -20"}...

📦 Tool: str_replace_based_edit_tool
   Input: {"command":"view","path":"./app/page.tsx"}...

💬 Claude:
Ho trovato una violazione della REGOLA 4 (Niente Corporate Fluff).
Nel file app/page.tsx c'è la frase "siamo leader nel settore".
Procedo a correggerla...

📦 Tool: str_replace_based_edit_tool
   Input: {"command":"str_replace","path":"./app/page.tsx",...}

✅ File modificato con successo.

📦 Tool: bash
   Input: {"command":"pnpm run build"}...

✅ Build completato con successo.

✅ Agent ha completato il task
🏁 TAYA Developer terminato
```

---

## Integrazione con Altri Agent

Questo agent lavora in sinergia con:

1. **Product Enrichment Agent** - Arricchisce prodotti con contenuti TAYA
2. **Blog Researcher Agent** - Genera articoli TAYA automaticamente
3. **TAYA Developer Agent** - Migliora il codice per aderire ai principi TAYA

Insieme formano un ecosistema completo per mantenere il sito sempre allineato alla filosofia "They Ask You Answer".

---

*Documentazione creata per Autonord Service - Gennaio 2026*
