// enrich-all.js
// Accoda TUTTI i prodotti Shopify per arricchimento AI via QStash.
// Non richiede il file Excel — legge i dati direttamente da Shopify.
//
// Uso:
//   set SHOPIFY_ADMIN_ACCESS_TOKEN=xxx
//   set QSTASH_TOKEN=xxx
//   node enrich-all.js
//
// Opzioni (variabili d'ambiente):
//   SKIP_ENRICHED=true   → salta prodotti già taggati "AI-Enhanced" (default: false)
//   STAGGER_SEC=30       → delay tra job consecutivi (default: 30s)
//   DRY_RUN=true         → mostra cosa farebbe senza accodare nulla
//   BATCH_PAUSE_MS=200   → pausa tra batch di chiamate QStash (default: 200ms)
//   MAX_JOBS=900         → limita il numero di job accodati (per piani con daily limit)
//   OFFSET=0             → salta i primi N prodotti (per riprendere da dove ci si è fermati)
//
// Piano QStash Free/1000: esegui in 4 giorni con MAX_JOBS=900
//   Giorno 1: node enrich-all.js                    (prodotti 0-899)
//   Giorno 2: set OFFSET=900  && node enrich-all.js  (prodotti 900-1799)
//   Giorno 3: set OFFSET=1800 && node enrich-all.js  (prodotti 1800-2699)
//   Giorno 4: set OFFSET=2700 && node enrich-all.js  (prodotti 2700-3538)
//
// Piano QStash Pay-as-you-go: nessun limite, esegui tutto in una volta
//   node enrich-all.js

// ── Configurazione ────────────────────────────────────────────────────────────
const SHOPIFY_DOMAIN  = process.env.SHOPIFY_SHOP_DOMAIN        || 'autonord-service.myshopify.com';
const SHOPIFY_TOKEN   = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || '';
const QSTASH_TOKEN    = process.env.QSTASH_TOKEN               || '';
const WORKER_URL      = 'https://autonord-shop.vercel.app/api/workers/regenerate-product';
const STAGGER_SEC     = parseInt(process.env.STAGGER_SEC  || '30', 10);
const SKIP_ENRICHED   = process.env.SKIP_ENRICHED === 'true';
const DRY_RUN         = process.env.DRY_RUN === 'true';
const BATCH_PAUSE_MS  = parseInt(process.env.BATCH_PAUSE_MS || '200', 10);
const MAX_JOBS        = process.env.MAX_JOBS ? parseInt(process.env.MAX_JOBS, 10) : null;
const OFFSET          = parseInt(process.env.OFFSET || '0', 10);
const PAGE_SIZE       = 250; // massimo consentito da Shopify GraphQL
// ─────────────────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function formatDuration(seconds) {
  if (seconds < 60)   return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

// ── Fetch all Shopify products via GraphQL cursor pagination ──────────────────
async function fetchAllProducts() {
  const products = [];
  let cursor    = null;
  let pageIndex = 0;

  do {
    pageIndex++;
    const query = `
      query getProducts($cursor: String) {
        products(first: ${PAGE_SIZE}, after: $cursor, query: "status:active") {
          edges {
            node {
              id
              title
              vendor
              productType
              tags
              images(first: 1) { edges { node { id } } }
              variants(first: 1) {
                edges {
                  node { sku barcode price }
                }
              }
            }
          }
          pageInfo { hasNextPage endCursor }
        }
      }
    `;

    // Retry up to 3 times on transient errors (502, 503, 504, 429)
    let res, json;
    for (let attempt = 1; attempt <= 3; attempt++) {
      res = await fetch(`https://${SHOPIFY_DOMAIN}/admin/api/2024-01/graphql.json`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': SHOPIFY_TOKEN,
        },
        body: JSON.stringify({ query, variables: { cursor } }),
      });

      if (res.ok) break;

      const status = res.status;
      if ([429, 502, 503, 504].includes(status) && attempt < 3) {
        const wait = attempt * 5000; // 5s, 10s
        process.stdout.write(`\n   ⚠️  Shopify ${status} (pagina ${pageIndex}), retry ${attempt}/3 tra ${wait/1000}s...`);
        await sleep(wait);
        continue;
      }

      throw new Error(`Shopify API error ${status}: ${await res.text()}`);
    }

    json = await res.json();

    if (json.errors) {
      throw new Error(`Shopify GraphQL error: ${JSON.stringify(json.errors)}`);
    }

    const edges    = json.data?.products?.edges || [];
    const pageInfo = json.data?.products?.pageInfo;

    for (const { node } of edges) products.push(node);

    process.stdout.write(`\r   ↓  Caricamento prodotti da Shopify... ${products.length} (pagina ${pageIndex})   `);

    cursor = pageInfo?.hasNextPage ? pageInfo.endCursor : null;

    // Small pause to respect Shopify rate limits between pages
    if (cursor) await sleep(300);

  } while (cursor);

  process.stdout.write('\n');
  return products;
}

// ── Queue single product for enrichment via QStash ────────────────────────────
async function queueProduct(product, delaySeconds) {
  const variant   = product.variants?.edges?.[0]?.node;
  const hasImages = (product.images?.edges?.length || 0) > 0;
  const numericId = product.id.replace('gid://shopify/Product/', '');

  const job = {
    productId:   numericId,
    productGid:  product.id,
    title:       product.title,
    vendor:      product.vendor       || 'Sconosciuto',
    productType: product.productType  || 'Elettroutensile',
    sku:         variant?.sku         || '',
    barcode:     variant?.barcode     || null,
    price:       variant?.price       || '0',
    tags:        product.tags         || [],
    hasImages,
    receivedAt:  new Date().toISOString(),
  };

  const headers = {
    'Authorization':  `Bearer ${QSTASH_TOKEN}`,
    'Content-Type':   'application/json',
    'Upstash-Retries': '3',
  };

  if (delaySeconds > 0) {
    headers['Upstash-Delay'] = `${delaySeconds}s`;
  }

  const res = await fetch(
    `https://qstash.upstash.io/v2/publish/${WORKER_URL}`,
    { method: 'POST', headers, body: JSON.stringify(job) }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`QStash ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  return data.messageId;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n🤖  Enrich-All — Arricchimento AI per tutti i prodotti Shopify');
  console.log(`   Worker URL  : ${WORKER_URL}`);
  console.log(`   Shopify     : ${SHOPIFY_DOMAIN}`);
  console.log(`   Stagger     : ${STAGGER_SEC}s tra job`);
  console.log(`   Skip AI-Enhanced : ${SKIP_ENRICHED}`);
  if (DRY_RUN) console.log('   ⚠️  DRY RUN — nessun job verrà accodato');
  console.log('');

  // Validate credentials
  if (!SHOPIFY_TOKEN) {
    console.error('❌  SHOPIFY_ADMIN_ACCESS_TOKEN non configurato!');
    console.error('   Esegui: set SHOPIFY_ADMIN_ACCESS_TOKEN=xxx  (oppure export su bash)');
    process.exit(1);
  }
  if (!QSTASH_TOKEN && !DRY_RUN) {
    console.error('❌  QSTASH_TOKEN non configurato!');
    console.error('   Esegui: set QSTASH_TOKEN=xxx  (oppure export su bash)');
    process.exit(1);
  }

  // Step 1: Fetch all products from Shopify
  console.log('📦  Step 1: Fetch prodotti da Shopify...');
  const allProducts = await fetchAllProducts();
  console.log(`   Trovati: ${allProducts.length} prodotti attivi\n`);

  // Step 2: Filter
  let toEnrich = allProducts;
  if (SKIP_ENRICHED) {
    toEnrich = allProducts.filter(p => !p.tags?.includes('AI-Enhanced'));
    const skipped = allProducts.length - toEnrich.length;
    console.log(`   Già arricchiti (skip): ${skipped}`);
    console.log(`   Da arricchire: ${toEnrich.length}\n`);
  }

  if (toEnrich.length === 0) {
    console.log('✅  Nessun prodotto da arricchire.');
    return;
  }

  // Apply OFFSET and MAX_JOBS windowing
  if (OFFSET > 0) {
    toEnrich = toEnrich.slice(OFFSET);
    console.log(`   Offset applicato: salto i primi ${OFFSET} prodotti\n`);
  }
  if (MAX_JOBS !== null && toEnrich.length > MAX_JOBS) {
    toEnrich = toEnrich.slice(0, MAX_JOBS);
    console.log(`   MAX_JOBS applicato: accoderò solo ${MAX_JOBS} prodotti\n`);
  }

  if (toEnrich.length === 0) {
    console.log('✅  Nessun prodotto nel range specificato (controlla OFFSET).');
    return;
  }

  // Estimate
  const totalDelaySeconds = (toEnrich.length - 1) * STAGGER_SEC;
  console.log(`📊  Riepilogo:`);
  console.log(`   Prodotti da arricchire  : ${toEnrich.length}`);
  if (OFFSET > 0) console.log(`   Offset (salto iniziale) : ${OFFSET}`);
  console.log(`   Stagger per job         : ${STAGGER_SEC}s`);
  console.log(`   Finestra totale         : ~${formatDuration(totalDelaySeconds)} (completamento stime)`);
  console.log(`   Note: il worker V5 impiega ~2-3 min per prodotto su Vercel (300s max)\n`);

  if (DRY_RUN) {
    console.log('🔍  DRY RUN — i primi 5 job sarebbero:');
    for (let i = 0; i < Math.min(5, toEnrich.length); i++) {
      const p = toEnrich[i];
      const variant = p.variants?.edges?.[0]?.node;
      console.log(`   [${i}] delay=${i * STAGGER_SEC}s | ${p.title} | sku=${variant?.sku || '—'} | barcode=${variant?.barcode || '—'}`);
    }
    console.log('\n   Per accodare davvero: rimuovi DRY_RUN=true');
    return;
  }

  // Step 3: Queue all products
  console.log('📮  Step 2: Accodamento job su QStash...\n');

  const BATCH_SIZE = 50; // publish in batches to avoid overwhelming local network
  let queued = 0;
  let failed  = 0;
  const errors = [];
  const startTime = Date.now();

  for (let i = 0; i < toEnrich.length; i += BATCH_SIZE) {
    const batch = toEnrich.slice(i, i + BATCH_SIZE);

    const batchResults = await Promise.allSettled(
      batch.map((product, batchIdx) => {
        const globalIdx  = i + batchIdx;
        const delaySecs  = globalIdx * STAGGER_SEC;
        return queueProduct(product, delaySecs);
      })
    );

    for (const result of batchResults) {
      if (result.status === 'fulfilled') {
        queued++;
      } else {
        failed++;
        errors.push(result.reason?.message || 'Unknown error');
      }
    }

    const progress  = Math.min(i + BATCH_SIZE, toEnrich.length);
    const pct       = ((progress / toEnrich.length) * 100).toFixed(1);
    const elapsed   = ((Date.now() - startTime) / 1000).toFixed(0);
    process.stdout.write(
      `\r   [${progress}/${toEnrich.length} — ${pct}%] queued=${queued} failed=${failed} | ${elapsed}s   `
    );

    if (i + BATCH_SIZE < toEnrich.length) {
      await sleep(BATCH_PAUSE_MS);
    }
  }

  process.stdout.write('\n\n');

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(0);
  console.log('─'.repeat(60));
  console.log(`✅  Accodamento completato in ${totalTime}s`);
  console.log(`   Job accodati : ${queued}`);
  console.log(`   Job falliti  : ${failed}`);
  console.log('─'.repeat(60));

  if (errors.length > 0) {
    console.log('\n⚠️  Errori (primi 5):');
    errors.slice(0, 5).forEach((e, i) => console.log(`   ${i + 1}. ${e}`));
  }

  const firstDelivery = new Date(Date.now() + 5000).toLocaleTimeString();
  const lastDelivery  = new Date(Date.now() + totalDelaySeconds * 1000).toLocaleTimeString();
  console.log(`\n🗓️  Finestra di esecuzione:`);
  console.log(`   Primo job consegnato  : ~${firstDelivery} (quasi subito)`);
  console.log(`   Ultimo job consegnato : ~${lastDelivery} (tra ~${formatDuration(totalDelaySeconds)})`);
  console.log('\n   Monitora i log su: https://vercel.com/dashboard → Functions');
  console.log('   Stato messaggi QStash: https://console.upstash.com → QStash → Messages\n');
}

main().catch(err => {
  console.error('\n❌  Errore fatale:', err.message);
  process.exit(1);
});
