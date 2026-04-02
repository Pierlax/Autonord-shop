/**
 * scripts/test-setup.ts
 *
 * Script di diagnostica rapida per verificare che l'ambiente sia pronto
 * per l'esecuzione del RAG con Gemini.
 *
 * Esegui con: npx tsx scripts/test-setup.ts
 */

import { config } from 'dotenv';
import { resolve } from 'path';

// Carica le variabili d'ambiente da .env.local se presente
config({ path: resolve(process.cwd(), '.env.local') });

async function checkEnvironment() {
  console.log('🔍 Inizio diagnostica ambiente Autonord...\n');

  let hasErrors = false;

  // 1. Verifica Chiavi Critiche (Presenza)
  const requiredKeys = [
    'SHOPIFY_ADMIN_ACCESS_TOKEN',
    'SHOPIFY_SHOP_DOMAIN',
    'GOOGLE_GENERATIVE_AI_API_KEY',
    'CRON_SECRET'
  ];

  console.log('🔑 Controllo Variabili d\'Ambiente:');
  for (const key of requiredKeys) {
    if (process.env[key]) {
      console.log(`   ✅ ${key} è presente.`);
    } else {
      console.error(`   ❌ ${key} MANCA!`);
      hasErrors = true;
    }
  }

  if (hasErrors) {
    console.error('\n⛔ IMPOSSIBILE PROCEDERE: Configura le variabili mancanti in .env.local');
    process.exit(1);
  }

  // 2. Test Connessione Shopify Admin API
  console.log('\n🛍️  Test Connessione Shopify...');
  const shopifyUrl = `https://${process.env.SHOPIFY_SHOP_DOMAIN}/admin/api/2024-01/shop.json`;
  
  try {
    const shopResponse = await fetch(shopifyUrl, {
      headers: {
        'X-Shopify-Access-Token': process.env.SHOPIFY_ADMIN_ACCESS_TOKEN!
      }
    });

    if (shopResponse.ok) {
      const shopData = await shopResponse.json();
      console.log(`   ✅ Connesso a Shopify! Negozio: "${shopData.shop.name}"`);
      console.log(`   📧 Email contatto: ${shopData.shop.email}`);
    } else {
      console.error(`   ❌ Errore Shopify: ${shopResponse.status} ${shopResponse.statusText}`);
      hasErrors = true;
    }
  } catch (error) {
    console.error(`   ❌ Errore di rete verso Shopify:`, error);
    hasErrors = true;
  }

  // 3. Test Connessione Gemini (Google AI)
  console.log('\n🤖 Test Connessione Gemini AI...');
  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GOOGLE_GENERATIVE_AI_API_KEY}`;
  
  try {
    const geminiPayload = {
      contents: [{ parts: [{ text: "Rispondi solo con la parola 'OK'." }] }]
    };

    const geminiResponse = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(geminiPayload)
    });

    if (geminiResponse.ok) {
      const geminiData = await geminiResponse.json();
      const answer = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
      if (answer && answer.includes('OK')) {
        console.log(`   ✅ Connesso a Gemini! Risposta ricevuta.`);
      } else {
        console.warn(`   ⚠️  Connesso a Gemini, ma risposta inattesa: "${answer}"`);
      }
    } else {
      const errText = await geminiResponse.text();
      console.error(`   ❌ Errore Gemini: ${geminiResponse.status} - ${errText}`);
      hasErrors = true;
    }
  } catch (error) {
    console.error(`   ❌ Errore di rete verso Gemini:`, error);
    hasErrors = true;
  }

  console.log('\n------------------------------------------------');
  if (hasErrors) {
    console.log('🔴 DIAGNOSTICA FALLITA. Correggi gli errori sopra prima di proseguire.');
    process.exit(1);
  } else {
    console.log('🟢 TUTTI I SISTEMI OPERATIVI. Puoi lanciare lo script di test del prodotto!');
    process.exit(0);
  }
}

checkEnvironment();
