// bulk-upload.js
// Carica l'intero catalogo Danea su Shopify con paginazione automatica.
// Uso: node bulk-upload.js
//
// Ogni batch:
//  - Sincronizza BATCH_SIZE prodotti su Shopify
//  - Accoda l'arricchimento AI via QStash (delay scalato lato server)
//  - Attende PAUSE_BETWEEN_BATCHES_MS prima del batch successivo
//
// Stima tempi:
//  - 3487 prodotti / 50 per batch = ~70 batch
//  - ~30 s per batch (Shopify rate limit 500 ms × 50 prodotti)
//  - + 5 s di pausa = ~35 s × 70 batch ≈ 40 minuti totali

require('dotenv').config();

const fs = require('fs');
const path = require('path');

// ── Configurazione ────────────────────────────────────────────────────────────
const FILE_PATH        = path.join(__dirname, 'test.xlsx');
const BASE_URL         = process.env.NEXT_PUBLIC_BASE_URL || 'https://autonord-shop.vercel.app';
const ENDPOINT         = `${BASE_URL}/api/sync/danea`;
const TOKEN            = process.env.CRON_SECRET;
const BATCH_SIZE       = 50;   // prodotti per batch (max 100)
const ONLY_ECOMMERCE   = true; // solo prodotti con flag E-commerce attivo
const PAUSE_BETWEEN_BATCHES_MS = 5_000; // 5 s tra un batch e il successivo
const MAX_RETRIES      = 3;    // max tentativi per batch prima di interrompere
// ─────────────────────────────────────────────────────────────────────────────

if (!TOKEN) {
  console.error('❌  CRON_SECRET non impostato. Configurarlo in .env o come variabile d\'ambiente.');
  process.exit(1);
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function formatDuration(ms) {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}m ${rem}s`;
}

async function sendBatch(fileBuffer, offset) {
  const blob = new Blob(
    [fileBuffer],
    { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }
  );
  const form = new FormData();
  form.append('file', blob, 'test.xlsx');

  const url = `${ENDPOINT}?onlyEcommerce=${ONLY_ECOMMERCE}&limit=${BATCH_SIZE}&offset=${offset}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}` },
    body: form,
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  return JSON.parse(text);
}

async function main() {
  if (!fs.existsSync(FILE_PATH)) {
    console.error(`❌  File non trovato: ${FILE_PATH}`);
    process.exit(1);
  }

  const fileBuffer = fs.readFileSync(FILE_PATH);
  console.log(`\n📂  File: ${FILE_PATH} (${(fileBuffer.length / 1024).toFixed(0)} KB)`);
  console.log(`⚙️   Batch size: ${BATCH_SIZE} | Solo e-commerce: ${ONLY_ECOMMERCE}\n`);

  const totals = { created: 0, updated: 0, failed: 0 };
  let offset         = 0;
  let batchIndex     = 0;
  let totalEligible  = null;
  let retryCount     = 0;
  const startTime    = Date.now();

  while (true) {
    batchIndex++;
    const batchLabel = totalEligible
      ? `[Batch ${batchIndex} | offset ${offset}/${totalEligible}]`
      : `[Batch ${batchIndex} | offset ${offset}]`;

    process.stdout.write(`${batchLabel} Invio...`);

    let data;
    try {
      data = await sendBatch(fileBuffer, offset);
      retryCount = 0; // reset on success
    } catch (err) {
      retryCount++;
      console.error(`\n❌  Errore al batch ${batchIndex} (tentativo ${retryCount}/${MAX_RETRIES}): ${err.message}`);
      if (retryCount >= MAX_RETRIES) {
        console.error('   Troppi tentativi falliti consecutivi. Interruzione.');
        process.exit(1);
      }
      console.error('   Riprendo tra 15 secondi...');
      await sleep(15_000);
      batchIndex--; // non contare il batch fallito
      continue; // riprova lo stesso offset
    }

    // Prima risposta: scopriamo il totale dei prodotti eligibili
    if (totalEligible === null && data.summary?.totalEligible) {
      totalEligible = data.summary.totalEligible;
      const estimatedBatches = Math.ceil(totalEligible / BATCH_SIZE);
      const estimatedMinutes = Math.round((estimatedBatches * (30 + PAUSE_BETWEEN_BATCHES_MS / 1000)) / 60);
      console.log(`\n📊  Prodotti eligibili totali: ${totalEligible}`);
      console.log(`🗓️   Batch stimati: ${estimatedBatches} | Tempo stimato: ~${estimatedMinutes} min\n`);
      process.stdout.write(`${batchLabel} Invio...`);
    }

    const { created = 0, updated = 0, failed = 0, total = 0 } = data.summary || {};
    totals.created += created;
    totals.updated += updated;
    totals.failed  += failed;

    const elapsed = formatDuration(Date.now() - startTime);
    const progress = totalEligible
      ? ` (${Math.min(offset + total, totalEligible)}/${totalEligible} — ${((offset + total) / totalEligible * 100).toFixed(1)}%)`
      : '';

    console.log(` ✅  +${created} creati  +${updated} aggiornati  ${failed > 0 ? `⚠️ ${failed} falliti  ` : ''}| ${elapsed}${progress}`);

    if (!data.hasMore) break;

    offset = data.nextOffset;
    await sleep(PAUSE_BETWEEN_BATCHES_MS);
  }

  const totalTime = formatDuration(Date.now() - startTime);
  console.log('\n' + '─'.repeat(60));
  console.log(`✅  Completato in ${totalTime}`);
  console.log(`   Creati:      ${totals.created}`);
  console.log(`   Aggiornati:  ${totals.updated}`);
  console.log(`   Falliti:     ${totals.failed}`);
  console.log('─'.repeat(60));
  console.log('🤖  I job di arricchimento AI sono in coda su QStash.');
  console.log('   Monitora i log su: https://vercel.com/dashboard → Functions\n');
}

main().catch(err => {
  console.error('\n❌  Errore fatale:', err.message);
  process.exit(1);
});
