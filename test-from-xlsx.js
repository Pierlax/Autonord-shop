// test-from-xlsx.js
// Legge 10 righe casuali da test.xlsx e invia ciascuna al worker di enrichment.
// Usa: node test-from-xlsx.js
//
// Seleziona prodotti con E-commerce=Sì, dati validi, diversi produttori.

const xlsx = require('xlsx');

const BASE_URL = 'https://autonord-shop.vercel.app';
const TOKEN    = 'autonord-cron-2024-xK9mP2vL8nQ4';
const ENDPOINT = `${BASE_URL}/api/workers/regenerate-product`;

const TIMEOUT_MS   = 180_000; // 3 minuti per prodotto (pipeline completa)
const DELAY_MS     = 2_000;   // pausa tra un prodotto e l'altro

// ── Leggi il file xlsx ──────────────────────────────────────────────────────
const wb   = xlsx.readFile('test.xlsx');
const ws   = wb.Sheets[wb.SheetNames[0]];
const rows = xlsx.utils.sheet_to_json(ws);

// ── Filtra righe valide ─────────────────────────────────────────────────────
const valid = rows.filter(r =>
  r['E-commerce'] === 'Sì' &&
  r['Descrizione'] && r['Descrizione'].trim().length > 5 &&
  r['Produttore']  && r['Produttore'].trim().length > 2
);

// ── Scegli 10 righe casuali (1 per produttore dove possibile) ───────────────
function pickRandom(arr, n) {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  const chosen   = [];
  const seenVendors = new Set();

  // Prima passa: 1 per produttore
  for (const row of shuffled) {
    const v = row['Produttore'].trim();
    if (!seenVendors.has(v)) {
      chosen.push(row);
      seenVendors.add(v);
      if (chosen.length >= n) break;
    }
  }
  // Seconda passa: riempi se non bastano i produttori unici
  for (const row of shuffled) {
    if (chosen.length >= n) break;
    if (!chosen.includes(row)) chosen.push(row);
  }
  return chosen.slice(0, n);
}

const selected = pickRandom(valid, 10);

// ── Mappa riga xlsx → WorkerPayload ─────────────────────────────────────────
function toPayload(row, idx) {
  const sku  = (row['Cod.'] || `TEST-${idx}`).trim();
  const code = (row['Cod per il F.'] || '').trim();
  return {
    productId:   `TEST-${sku}`,
    productGid:  `gid://shopify/Product/TEST-${sku}`,
    title:       row['Descrizione'].trim(),
    vendor:      row['Produttore'].trim(),
    productType: 'Utensili e Attrezzatura',   // categoria generica
    sku,
    barcode:     code || null,
    price:       String(row['Prezzo forn.'] || '0'),
    tags:        ['danea-sync', 'test-xlsx', 'auto-enrich'],
    hasImages:   false,
    receivedAt:  new Date().toISOString(),
  };
}

// ── Chiama il worker ─────────────────────────────────────────────────────────
async function callWorker(payload) {
  const controller = new AbortController();
  const timer      = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const t0         = Date.now();

  try {
    const res  = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${TOKEN}`,
      },
      body:   JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timer);

    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    const text    = await res.text();

    if (res.ok) {
      try {
        const json = JSON.parse(text);
        const conf = json.metrics?.enrichment?.confidence ?? json.confidence ?? '?';
        const srcs = json.metrics?.rag?.sourcesQueried ?? json.sourcesQueried ?? '?';
        console.log(`  ✅  HTTP ${res.status} (${elapsed}s) | confidence=${conf} | sources=${srcs}`);
        if (json.warnings?.length) console.log(`     ⚠️  warnings: ${json.warnings.join(', ')}`);
      } catch {
        console.log(`  ✅  HTTP ${res.status} (${elapsed}s) | risposta non-JSON`);
        console.log(`     ${text.slice(0, 200)}`);
      }
    } else {
      console.log(`  ❌  HTTP ${res.status} (${elapsed}s)`);
      console.log(`     ${text.slice(0, 400)}`);
    }
  } catch (err) {
    clearTimeout(timer);
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    if (err.name === 'AbortError') {
      console.log(`  ⏰  TIMEOUT dopo ${elapsed}s`);
    } else {
      console.log(`  ❌  Errore di rete (${elapsed}s): ${err.message}`);
    }
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  Test generazione schede — 10 prodotti casuali');
  console.log(`  Fonte: test.xlsx  (${valid.length} righe valide)`);
  console.log(`  Endpoint: ${ENDPOINT}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  for (let i = 0; i < selected.length; i++) {
    const payload = toPayload(selected[i], i + 1);
    console.log(`[${i + 1}/10] ${payload.title}`);
    console.log(`       Produttore: ${payload.vendor} | SKU: ${payload.sku}`);
    await callWorker(payload);
    if (i < selected.length - 1) {
      console.log(`       ⏳ pausa ${DELAY_MS / 1000}s...\n`);
      await sleep(DELAY_MS);
    }
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  Test completato.');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

main();
