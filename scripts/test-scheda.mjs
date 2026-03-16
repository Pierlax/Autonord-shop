/**
 * Test: genera scheda prodotto applicando AGENT_1_PRODUCT_DIRECTIVE (TAYA+KRUG+JTBD)
 * Prodotto: PIASTRA VIBRANTE MIKASA MVC-F60H VAS
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

// Load .env.local
const envPath = resolve(process.cwd(), '.env.local');
const envContent = readFileSync(envPath, 'utf-8');
const env = Object.fromEntries(
  envContent.split('\n')
    .filter(l => l.trim() && !l.startsWith('#'))
    .map(l => { const eq = l.indexOf('='); return [l.slice(0, eq).trim(), l.slice(eq + 1).trim().replace(/^["']|["']$/g, '')]; })
);

const API_KEY = env.GOOGLE_GENERATIVE_AI_API_KEY;
if (!API_KEY) throw new Error('GOOGLE_GENERATIVE_AI_API_KEY not found in .env.local');

// Product data from test.xlsx row 2373
const product = {
  daneaCode: 'IMER040',
  supplierCode: '7150216',
  title: 'PIASTRA VIBRANTE MIKASA MVC F60H VAS MOTORE BENZINA HONDA KW 2,4',
  manufacturer: 'IMER INTERNATIONAL S.P.A.',
  category: 'MERCI C/VENDITE',
  price: 2444.00,
  compareAtPrice: 2004.08,
  costPrice: 1540.00,
  quantity: 1,
};

const AGENT_1_PRODUCT_DIRECTIVE = `
### AUTONORD CORE PHILOSOPHY: "THE PRAGMATIC TRUTH"

Sei un partner strategico per professionisti dell'edilizia. Non sei un venditore, né un robot.
Ogni tuo output deve superare il Test della Triade (TAYA + KRUG + JTBD).

**TAYA (Marcus Sheridan):** Onestà radicale. Rispondi ai Big 5: prezzi, problemi, confronti, recensioni, come funziona.
- Mai nascondere prezzi, limiti, difetti
- Confronta con competitor anche se scomodo
- Banned words: "leader di settore", "eccellenza", "qualità superiore", "il migliore", "straordinario", "eccezionale", "all'avanguardia", "perfetto"

**KRUG (Steve Krug):** Chiarezza batte completezza. Frasi max 20 parole. Bullet > paragrafi.

**JTBD (Clayton Christensen):** Collega ogni spec a un beneficio lavorativo concreto.
- "5Ah" → "Mezza giornata senza ricaricare"
- Specifica "Per chi" e "Non per chi"

### FORMATO OUTPUT OBBLIGATORIO

**Per:** [Mestiere specifico] che [job to be done]
**Prezzo:** €[prezzo] (confronto con competitor se disponibile)
**Verdetto:** [1 frase onesta — quando sceglierlo e quando no]

**Ideale se:**
- [Condizione lavoro 1]
- [Condizione lavoro 2]
- [Condizione lavoro 3]

**Non per te se:**
- [Quando guardare altrove 1]
- [Quando guardare altrove 2]

**Specifiche che contano:**
- **[Spec]:** [Valore] → [Cosa significa per il TUO lavoro]

**Pro (verificati):**
- [Beneficio collegato a job outcome]

**Contro (onesti):**
- [Limite reale con alternativa se esiste]

**JTBD - Le 3 Dimensioni:**
- **Funzionale:** ...
- **Emotivo:** ...
- **Sociale:** ...
`;

const userPrompt = `Genera una scheda prodotto completa per:

**Prodotto:** ${product.title}
**Produttore/Brand:** ${product.manufacturer}
**Codice catalogo:** ${product.supplierCode}
**Prezzo di vendita:** €${product.price.toFixed(2)}
**Prezzo rivenditori:** €${product.compareAtPrice.toFixed(2)}
**Costo acquisto:** €${product.costPrice.toFixed(2)}
**Disponibilità:** ${product.quantity} unità in magazzino

Usa tutte le tue conoscenze tecniche sul prodotto (motore Honda GX160, sistema VAS anti-vibrazione, applicazioni cantiere) per generare una scheda TAYA+KRUG+JTBD completa. Il pubblico è professionisti dell'edilizia italiani (muratori, stradini, imprese di costruzione).`;

console.log('📦 Prodotto:', product.title);
console.log('🔑 Usando GOOGLE_GENERATIVE_AI_API_KEY');
console.log('⏳ Chiamata a Gemini 2.0 Flash...\n');

const response = await fetch(
  `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: AGENT_1_PRODUCT_DIRECTIVE }] },
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      generationConfig: {
        temperature: 0.5,
        maxOutputTokens: 4096,
      },
    }),
  }
);

if (!response.ok) {
  const err = await response.text();
  throw new Error(`Gemini API error ${response.status}: ${err}`);
}

const data = await response.json();
const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

if (!text) throw new Error('Empty response from Gemini');

console.log('='.repeat(60));
console.log('📋 SCHEDA PRODOTTO GENERATA');
console.log('='.repeat(60));
console.log(text);
console.log('='.repeat(60));
console.log(`\n✅ Tokens usati: input=${data.usageMetadata?.promptTokenCount} output=${data.usageMetadata?.candidatesTokenCount}`);
