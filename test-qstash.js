// test-qstash.js
// Accoda UN singolo prodotto di test via QStash (senza delay)
// e mostra il messageId per poter verificare la delivery su app.upstash.com
//
// Uso: node test-qstash.js
// Richiede: QSTASH_TOKEN nell'ambiente (o hardcoded sotto)
//
// STEP 1: node test-qstash.js  → accoda il job, copia il messageId
// STEP 2: vai su app.upstash.com → QStash → Messages → cerca il messageId
// STEP 3: controlla se lo stato è "Delivered", "Failed", o "Pending"

const QSTASH_TOKEN  = process.env.QSTASH_TOKEN || '';  // Imposta la var o sostituisci qui
const WORKER_URL    = 'https://autonord-shop.vercel.app/api/workers/regenerate-product';

const TEST_JOB = {
  productId: '9876543210',
  productGid: 'gid://shopify/Product/9876543210',
  title: 'Milwaukee M18 CAG115XPDB-0 Smerigliatrice 18V',
  vendor: 'Milwaukee',
  productType: 'Utensili a batteria',
  sku: 'M18CAG115XPDB-0',
  barcode: '4933451900',
  price: '0',
  tags: ['danea-sync', 'auto-enrich', 'qstash-test'],
  hasImages: false,
  receivedAt: new Date().toISOString(),
};

async function main() {
  if (!QSTASH_TOKEN) {
    console.error('❌  QSTASH_TOKEN non configurato!');
    console.error('   Esegui: QSTASH_TOKEN=xxx node test-qstash.js');
    console.error('   oppure imposta il valore nella riga QSTASH_TOKEN del file.');
    process.exit(1);
  }

  console.log('📮  Test QStash Delivery');
  console.log(`   Worker URL : ${WORKER_URL}`);
  console.log(`   Prodotto   : ${TEST_JOB.title}`);
  console.log('');

  try {
    const res = await fetch(`https://qstash.upstash.io/v2/publish/${WORKER_URL}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${QSTASH_TOKEN}`,
        'Content-Type': 'application/json',
        'Upstash-Retries': '1',        // Solo 1 retry per il test
        'Upstash-Delay': '0s',         // Consegna immediata
      },
      body: JSON.stringify(TEST_JOB),
    });

    const text = await res.text();

    if (!res.ok) {
      console.error(`❌  QStash API error HTTP ${res.status}:`);
      console.error(text);
      return;
    }

    const data = JSON.parse(text);
    console.log('✅  Job accodato con successo!');
    console.log(`   MessageId : ${data.messageId}`);
    console.log('');
    console.log('📋  Prossimi step:');
    console.log('   1. Vai su https://console.upstash.com → QStash → Messages');
    console.log(`   2. Cerca messageId: ${data.messageId}`);
    console.log('   3. Controlla se lo stato è "Delivered ✅" o "Failed ❌"');
    console.log('   4. Se Failed → copia il messaggio di errore e condividilo');
    console.log('');
    console.log('   In parallelo → Vercel logs (https://vercel.com/dashboard → Functions):');
    console.log('   Dovresti vedere una POST a /api/workers/regenerate-product entro pochi secondi');

  } catch (err) {
    console.error(`❌  Errore: ${err.message}`);
  }
}

main();
