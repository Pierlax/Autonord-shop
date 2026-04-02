// test-upload.js
// Uso: node test-upload.js
// Carica test.xlsx (nella stessa cartella) sull'endpoint /api/sync/danea

const fs = require('fs');
const path = require('path');
// FormData and Blob are globals in Node 18+ — no import needed

const FILE_PATH = path.join(__dirname, 'test.xlsx');
const URL = 'https://autonord-shop.vercel.app/api/sync/danea?onlyEcommerce=true&limit=5';
const TOKEN = 'autonord-cron-2024-xK9mP2vL8nQ4';

async function main() {
  if (!fs.existsSync(FILE_PATH)) {
    console.error(`❌ File non trovato: ${FILE_PATH}`);
    console.error('   Rinomina il tuo file in "test.xlsx" e mettilo nella stessa cartella di questo script.');
    process.exit(1);
  }

  const buffer = fs.readFileSync(FILE_PATH);
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

  const form = new FormData();
  form.append('file', blob, 'test.xlsx');

  console.log(`📤 Caricamento ${FILE_PATH} (${buffer.length} bytes)...`);

  const res = await fetch(URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}` },
    body: form,
  });

  const text = await res.text();
  console.log(`\n📬 HTTP ${res.status} ${res.statusText}`);

  try {
    console.log(JSON.stringify(JSON.parse(text), null, 2));
  } catch {
    console.log(text);
  }
}

main().catch(err => {
  console.error('❌ Errore:', err.message);
  process.exit(1);
});
