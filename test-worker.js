// test-worker.js
// Chiama direttamente il worker di enrichment con un timeout di 120 secondi.
// Usa: node test-worker.js
//
// Questo script permette di diagnosticare se il worker funziona correttamente
// senza passare per QStash.

const BASE_URL  = 'https://autonord-shop.vercel.app';
const TOKEN     = 'autonord-cron-2024-xK9mP2vL8nQ4';
const ENDPOINT  = `${BASE_URL}/api/workers/regenerate-product`;

// Prodotto di test reale dal catalogo Danea (Milwaukee M18 CAG115XPDB)
const TEST_PAYLOAD = {
  productId: '9876543210',   // Sostituisci con un ID Shopify reale se vuoi
  productGid: 'gid://shopify/Product/9876543210',
  title: 'Milwaukee M18 CAG115XPDB-0 Smerigliatrice angolare 18V',
  vendor: 'Milwaukee',
  productType: 'Utensili a batteria',
  sku: 'M18CAG115XPDB-0',
  barcode: '4933451900',
  price: '0',
  tags: ['danea-sync', 'auto-enrich', 'test'],
  hasImages: false,
  receivedAt: new Date().toISOString(),
};

async function main() {
  console.log('🔧  Test Worker Enrichment V5');
  console.log(`   Endpoint : ${ENDPOINT}`);
  console.log(`   Prodotto : ${TEST_PAYLOAD.title}`);
  console.log(`   SKU      : ${TEST_PAYLOAD.sku}`);
  console.log(`   Barcode  : ${TEST_PAYLOAD.barcode}`);
  console.log('');
  console.log('⏳  Invio richiesta (timeout 120s)...\n');

  const startTime = Date.now();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120_000); // 120s

    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TOKEN}`,
      },
      body: JSON.stringify(TEST_PAYLOAD),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const text = await res.text();

    console.log(`📡  HTTP ${res.status} (${elapsed}s)`);
    console.log('');

    if (res.ok) {
      try {
        const json = JSON.parse(text);
        console.log('✅  Enrichment riuscito!');
        console.log(JSON.stringify(json, null, 2));
      } catch {
        console.log('✅  Risposta ricevuta (non JSON):');
        console.log(text.slice(0, 500));
      }
    } else {
      console.log('❌  Errore dal worker:');
      console.log(text.slice(0, 1000));
    }

  } catch (err) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    if (err.name === 'AbortError') {
      console.error(`❌  TIMEOUT dopo ${elapsed}s — il worker non ha risposto entro 120 secondi.`);
      console.error('   Possibili cause:');
      console.error('   1. Il worker supera il maxDuration di Vercel (attualmente 60s)');
      console.error('   2. Una chiamata AI o HTTP si blocca indefinitamente');
      console.error('   3. Manca GOOGLE_GENERATIVE_AI_API_KEY su Vercel');
    } else {
      console.error(`❌  Errore di rete dopo ${elapsed}s: ${err.message}`);
    }
  }
}

main();
