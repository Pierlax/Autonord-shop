// test-xlsx-to-shopify.js
// 1. Legge 10 righe casuali da test.xlsx
// 2. Crea ogni prodotto su Shopify (draft)
// 3. Avvia l'enrichment worker su ogni prodotto creato
// Usa: node test-xlsx-to-shopify.js

const xlsx   = require('xlsx');
const fs     = require('fs');
const path   = require('path');

// ── Env dal file .env.local ──────────────────────────────────────────────────
function loadEnv() {
  const envPath = path.join(__dirname, '.env.local');
  const lines   = fs.readFileSync(envPath, 'utf8').split('\n');
  const env     = {};
  for (const line of lines) {
    const m = line.match(/^([A-Z_]+)="?([^"\r\n]+)"?\s*$/);
    if (m) env[m[1]] = m[2].trim();
  }
  return env;
}

const ENV              = loadEnv();
const SHOPIFY_DOMAIN   = ENV.SHOPIFY_SHOP_DOMAIN;
const SHOPIFY_TOKEN    = ENV.SHOPIFY_ADMIN_ACCESS_TOKEN;
const CRON_SECRET      = ENV.CRON_SECRET;

const BASE_URL  = 'https://autonord-shop.vercel.app';
const WORKER    = `${BASE_URL}/api/workers/regenerate-product`;

const TIMEOUT_WORKER = 180_000; // 3 min per prodotto
const DELAY_MS       = 3_000;   // pausa tra prodotti

// ── Shopify REST helpers ─────────────────────────────────────────────────────
async function shopifyRequest(path, method = 'GET', body = null) {
  const opts = {
    method,
    headers: {
      'X-Shopify-Access-Token': SHOPIFY_TOKEN,
      'Content-Type': 'application/json',
    },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`https://${SHOPIFY_DOMAIN}/admin/api/2024-01${path}`, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(`Shopify ${method} ${path} → ${res.status}: ${JSON.stringify(data)}`);
  return data;
}

async function createShopifyProduct(row) {
  const sku     = (row['Cod.'] || '').trim();
  const barcode = (row['Cod per il F.'] || '').trim() || null;
  const price   = row['Prezzo forn.'] ? String(Math.round(row['Prezzo forn.'] * 1.22)) : '0'; // IVA inclusa
  const title   = row['Descrizione'].trim();
  const vendor  = row['Produttore'].trim();

  const body = {
    product: {
      title,
      vendor,
      product_type: 'MERCI C/VENDITE',
      status: 'draft',
      tags: ['danea-sync', 'test-xlsx', 'auto-enrich'],
      variants: [{
        sku:        sku || undefined,
        barcode:    barcode || undefined,
        price,
        inventory_management: null,
        requires_shipping: true,
        taxable: true,
      }],
    },
  };

  const data = await shopifyRequest('/products.json', 'POST', body);
  return data.product;
}

// ── Worker helper ────────────────────────────────────────────────────────────
async function callWorker(product) {
  const variant  = product.variants?.[0] || {};
  const payload  = {
    productId:   String(product.id),
    productGid:  `gid://shopify/Product/${product.id}`,
    title:       product.title,
    vendor:      product.vendor,
    productType: product.product_type || 'MERCI C/VENDITE',
    sku:         variant.sku   || null,
    barcode:     variant.barcode || null,
    price:       variant.price || '0',
    tags:        product.tags ? product.tags.split(',').map(t => t.trim()) : [],
    hasImages:   false,
    receivedAt:  new Date().toISOString(),
  };

  const controller = new AbortController();
  const timer      = setTimeout(() => controller.abort(), TIMEOUT_WORKER);
  const t0         = Date.now();

  try {
    const res = await fetch(WORKER, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${CRON_SECRET}`,
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
        const m    = json.metrics || {};
        const conf = m.v3Confidence ?? m.confidence ?? '?';
        const srcs = m.ragSourcesQueried ?? m.sourcesQueried ?? '?';
        const img  = m.imageSource ?? m.imageSearchMethod ?? '?';
        const qa   = m.qaConfidence ?? '?';
        console.log(`  ✅  HTTP ${res.status} (${elapsed}s) | conf=${conf}% | sources=${srcs} | qa=${qa} | img=${img}`);
        if (json.warnings?.length) {
          console.log(`     ⚠️  warnings: ${json.warnings.join(', ')}`);
        }
        return { ok: true, confidence: conf, qa, sources: srcs, img };
      } catch {
        console.log(`  ✅  HTTP ${res.status} (${elapsed}s)`);
        console.log(`     ${text.slice(0, 300)}`);
        return { ok: true };
      }
    } else {
      console.log(`  ❌  HTTP ${res.status} (${elapsed}s)`);
      console.log(`     ${text.slice(0, 500)}`);
      return { ok: false, error: text };
    }
  } catch (err) {
    clearTimeout(timer);
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    if (err.name === 'AbortError') {
      console.log(`  ⏰  TIMEOUT dopo ${elapsed}s`);
    } else {
      console.log(`  ❌  Errore rete (${elapsed}s): ${err.message}`);
    }
    return { ok: false, error: err.message };
  }
}

// ── Selezione righe xlsx ─────────────────────────────────────────────────────
function pickRandom(arr, n) {
  const shuffled   = [...arr].sort(() => Math.random() - 0.5);
  const chosen     = [];
  const seenVendors = new Set();
  // 1 per produttore dove possibile
  for (const row of shuffled) {
    const v = row['Produttore'].trim();
    if (!seenVendors.has(v)) {
      chosen.push(row);
      seenVendors.add(v);
      if (chosen.length >= n) break;
    }
  }
  // riempimento se produttori < n
  for (const row of shuffled) {
    if (chosen.length >= n) break;
    if (!chosen.includes(row)) chosen.push(row);
  }
  return chosen.slice(0, n);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  // Carica xlsx
  const wb   = xlsx.readFile('test.xlsx');
  const ws   = wb.Sheets[wb.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(ws);

  const valid = rows.filter(r =>
    r['E-commerce'] === 'Sì' &&
    r['Descrizione'] && r['Descrizione'].trim().length > 5 &&
    r['Produttore']  && r['Produttore'].trim().length > 2
  );

  const selected = pickRandom(valid, 10);

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  Test: xlsx → Shopify (crea prodotto) → Enrichment');
  console.log(`  Fonte : test.xlsx  (${valid.length} righe valide)`);
  console.log(`  Shop  : ${SHOPIFY_DOMAIN}`);
  console.log(`  Worker: ${WORKER}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const results = [];

  for (let i = 0; i < selected.length; i++) {
    const row = selected[i];
    console.log(`[${i + 1}/10] ${row['Descrizione'].trim()}`);
    console.log(`       Produttore: ${row['Produttore'].trim()} | SKU: ${(row['Cod.'] || '').trim()}`);

    // Step 1: crea prodotto su Shopify
    let product;
    try {
      product = await createShopifyProduct(row);
      console.log(`  🏪  Creato su Shopify → ID: ${product.id} | Handle: ${product.handle}`);
    } catch (err) {
      console.log(`  ❌  Creazione Shopify fallita: ${err.message}`);
      results.push({ title: row['Descrizione'].trim(), ok: false, error: err.message });
      if (i < selected.length - 1) {
        console.log('');
        await sleep(DELAY_MS);
      }
      continue;
    }

    // Step 2: arricchisci con il worker
    const result = await callWorker(product);
    results.push({
      title:     row['Descrizione'].trim(),
      shopifyId: product.id,
      handle:    product.handle,
      ...result,
    });

    if (i < selected.length - 1) {
      console.log(`  ⏳  pausa ${DELAY_MS / 1000}s...\n`);
      await sleep(DELAY_MS);
    }
  }

  // Riepilogo
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  RIEPILOGO');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  const ok  = results.filter(r => r.ok).length;
  const err = results.filter(r => !r.ok).length;
  console.log(`  ✅  Successo: ${ok}/10   ❌  Errori: ${err}/10\n`);
  results.forEach((r, i) => {
    const icon = r.ok ? '✅' : '❌';
    const extra = r.ok
      ? `conf=${r.confidence}% | qa=${r.qa} | src=${r.sources} | img=${r.img} → https://${SHOPIFY_DOMAIN}/admin/products/${r.shopifyId}`
      : `error: ${r.error?.slice(0,80)}`;
    console.log(`  ${icon} ${i + 1}. ${r.title.slice(0, 55)}`);
    console.log(`        ${extra}`);
  });
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
