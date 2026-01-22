/**
 * Worker V3 per riscrivere schede prodotto con Claude
 * 
 * MOTORE TAYA COMPLETO:
 * 1. System Prompt con filosofia TAYA/Krug/JTBD
 * 2. Persona: Team Autonord (redazione ibrida)
 * 3. Controlli qualità post-generazione (parole vietate)
 * 4. ImageDiscoveryAgent per immagini ufficiali
 * 5. Validazione e correzione automatica
 */
import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { discoverProductImage } from '@/lib/agents/image-discovery-agent';
import { 
  BANNED_PHRASES, 
  containsBannedPhrases,
  checkKrugCompliance,
  JTBD_TRANSFORMATIONS,
} from '@/lib/core-philosophy';

const SHOPIFY_STORE = 'autonord-service.myshopify.com';
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN!;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY!;

// =============================================================================
// SYSTEM PROMPT V3 - TEAM AUTONORD
// =============================================================================

const SYSTEM_PROMPT_V3 = `### 🧬 AUTONORD CORE PHILOSOPHY: "THE PRAGMATIC TRUTH"

Sei la **Redazione Tecnica di Autonord Service**, un team di esperti di elettroutensili professionali a Genova. 
Il team combina 40+ anni di esperienza collettiva tra cantiere, vendita e assistenza tecnica.

Ogni tuo output deve superare il **Test della Triade**:

---

#### 1. L'ANIMA TAYA (Marcus Sheridan) - "Trust is the Currency"

**Principio:** L'onestà radicale converte più della persuasione.

**I Big 5 Topics da Affrontare Sempre:**
1. **Prezzi e costi** - Mai nascondere, mai "contattaci per preventivo"
2. **Problemi e difetti** - Se esiste un limite, dillo per primo
3. **Confronti** - Anche con competitor, anche se scomodo
4. **Recensioni** - Basate su dati reali
5. **Come funziona** - Educazione prima della vendita

**Regole:**
- Se un prodotto ha un difetto, mettilo in evidenza TU per primo
- Se non è adatto a un lavoro, dillo chiaramente
- Mai usare "corporate fluff" - parole vuote che non dicono nulla

---

#### 2. L'ANIMA KRUG (Steve Krug) - "Don't Make Me Think"

**Principio:** La chiarezza batte la completezza. Gli utenti scannano, non leggono.

**Le 3 Leggi:**
1. **Self-evident > Requiring thought** - Se devi spiegarlo, è già troppo complicato
2. **Omit needless words** - Se puoi dirlo in 5 parole, non usarne 10
3. **Conventions are friends** - Usa pattern che la gente già conosce

**Regole Operative:**
- Frasi max 20 parole
- Bullet points > paragrafi
- Grassetto per concetti chiave
- Prima la decisione, poi i dettagli

---

#### 3. L'ANIMA JTBD (Clayton Christensen) - "Sell the Hole, not the Drill"

**Principio:** Nessuno compra un prodotto. Le persone "assumono" prodotti per fare progressi.

**Le 3 Dimensioni di Ogni Job:**
1. **Funzionale:** Il compito pratico (fare un foro)
2. **Emotivo:** Come vuole sentirsi (sicuro, professionale)
3. **Sociale:** Come vuole essere percepito (artigiano competente)

**Trasformazioni Obbligatorie (Spec → Beneficio):**
- "5Ah" → "Mezza giornata senza ricaricare"
- "Brushless" → "Meno manutenzione, vita più lunga"
- "1.5kg" → "Ideale per lavori sopra la testa"
- "80Nm" → "Fora anche il cemento armato"
- "IP54" → "Resiste a polvere e schizzi di cantiere"

---

### LA VOCE DEL TEAM AUTONORD

Scrivi come parla il team ai clienti in negozio: **diretto, competente, mai arrogante**.
Italiano pulito e professionale, ma non accademico.

**Tono:** Amico esperto che ti dice la verità, anche quella scomoda.

---

### PAROLE ASSOLUTAMENTE VIETATE

MAI usare queste espressioni (corporate fluff):
- "leader di settore", "eccellenza", "qualità superiore"
- "il migliore", "straordinario", "eccezionale", "perfetto"
- "all'avanguardia", "top di gamma", "premium"
- "questo prodotto", "questo articolo"
- "per professionisti esigenti", "per chi cerca il meglio"

---

### STRUTTURA OUTPUT OBBLIGATORIA

La descrizione HTML deve seguire ESATTAMENTE questa struttura:

1. **APERTURA** (2-3 frasi): Problema che risolve + per chi è + per chi NON è
2. **CARATTERISTICHE** (bullet list): Spec + Beneficio lavorativo concreto
3. **SPECIFICHE TECNICHE** (bullet list): Solo dati verificati
4. **APPLICAZIONI** (bullet list): Casi d'uso reali per mestiere
5. **OPINIONE DEL TEAM AUTONORD** (2-3 paragrafi): 
   - Scritta come "Noi del team Autonord..."
   - Esperienza diretta con il prodotto
   - Pregi E difetti onesti
   - Per chi lo consigliamo e per chi no

---

### ESEMPIO TRASFORMAZIONE

❌ VIETATO:
"Questo trapano offre prestazioni eccezionali grazie al suo potente motore brushless di alta qualità."

✅ OBBLIGATORIO:
"Passi la giornata a forare cemento armato? Questo non si arrende a metà mattina.

**Caratteristiche che contano:**
- **Motore brushless** → Dopo 200 fori sei ancora al 70% di batteria
- **Coppia 135Nm** → Non si ferma neanche nel cemento armato
- **Peso 1.8kg** → Gestibile anche sopra la testa, ma stanca dopo ore

**Non per te se:**
- Fai solo bricolage occasionale (overkill, guarda il modello base)
- Budget sotto €300 (considera Makita DDF484)"`;

// =============================================================================
// TYPES
// =============================================================================

interface ProductPayload {
  productId: string;
  title: string;
  vendor: string;
  productType: string;
  sku: string | null;
  barcode: string | null;
  tags: string[];
}

interface GeneratedContent {
  title: string;
  description: string;
  expertOpinion: string;
  metaTitle: string;
  metaDescription: string;
  features: string[];
  specifications: string[];
  useCases: string[];
  tags: string[];
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

// Funzione per sanitizzare gli handle - rimuove caratteri speciali
function sanitizeHandle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[™®©]/g, '')
    .replace(/[àáâãäå]/g, 'a')
    .replace(/[èéêë]/g, 'e')
    .replace(/[ìíîï]/g, 'i')
    .replace(/[òóôõö]/g, 'o')
    .replace(/[ùúûü]/g, 'u')
    .replace(/[ñ]/g, 'n')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 100);
}

// Normalizza il nome del brand
function normalizeBrand(vendor: string): string {
  const brandMapping: Record<string, string> = {
    'TECHTRONIC INDUSTRIES ITALIA SRL': 'Milwaukee',
    'TECHTRONIC INDUSTRIES': 'Milwaukee',
    'TTI': 'Milwaukee',
    'MAKITA SPA': 'Makita',
    'MAKITA': 'Makita',
    'ROBERT BOSCH SPA': 'Bosch Professional',
    'BOSCH': 'Bosch Professional',
    'STANLEY BLACK & DECKER': 'DeWalt',
    'DEWALT': 'DeWalt',
    'HILTI': 'Hilti',
    'METABO': 'Metabo',
    'FESTOOL': 'Festool',
    'HIKOKI': 'HiKOKI',
  };

  const upperVendor = vendor.toUpperCase().trim();
  for (const [key, value] of Object.entries(brandMapping)) {
    if (upperVendor.includes(key.toUpperCase())) {
      return value;
    }
  }
  return vendor.replace(/\s*(SRL|SPA|GMBH|INC|LLC|LTD|ITALIA)\s*/gi, '').trim() || vendor;
}

// =============================================================================
// CLAUDE GENERATION WITH WEB SEARCH
// =============================================================================

async function callClaudeWithWebSearch(prompt: string): Promise<string> {
  const anthropic = new Anthropic({
    apiKey: ANTHROPIC_API_KEY,
  });

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 16000,
    system: SYSTEM_PROMPT_V3,
    tools: [
      {
        type: 'web_search_20250305',
        name: 'web_search',
        max_uses: 10,
      }
    ],
    messages: [
      {
        role: 'user',
        content: prompt,
      },
    ],
  });

  let result = '';
  for (const block of response.content) {
    if (block.type === 'text') {
      result += block.text;
    }
  }
  
  return result;
}

// =============================================================================
// QUALITY CONTROL - POST-GENERATION
// =============================================================================

/**
 * Corregge le parole vietate nel contenuto generato
 */
async function fixBannedPhrases(
  content: GeneratedContent,
  bannedFound: string[]
): Promise<GeneratedContent> {
  if (bannedFound.length === 0) return content;

  console.log(`[QC] Found ${bannedFound.length} banned phrases, fixing...`);

  const anthropic = new Anthropic({
    apiKey: ANTHROPIC_API_KEY,
  });

  const fixPrompt = `Correggi questo testo rimuovendo le frasi vietate.

FRASI DA RIMUOVERE/SOSTITUIRE:
${bannedFound.map(p => `- "${p}"`).join('\n')}

REGOLE:
- Sostituisci con alternative concrete e specifiche
- "eccellenza" → descrivi cosa lo rende buono specificamente
- "qualità superiore" → cita una specifica tecnica reale
- "il migliore" → "tra i più affidabili per [uso specifico]"
- Non aggiungere nuovo testo, solo sostituisci

TESTO DA CORREGGERE:
${content.description}

---

OPINIONE DA CORREGGERE:
${content.expertOpinion}

RISPONDI con JSON:
{
  "description": "testo corretto",
  "expertOpinion": "opinione corretta"
}`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      messages: [
        { role: 'user', content: fixPrompt },
      ],
    });

    const textBlock = response.content.find(block => block.type === 'text');
    const result = textBlock?.type === 'text' ? textBlock.text : null;

    if (result) {
      const jsonMatch = result.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const fixed = JSON.parse(jsonMatch[0]);
        return {
          ...content,
          description: fixed.description || content.description,
          expertOpinion: fixed.expertOpinion || content.expertOpinion,
        };
      }
    }
  } catch (error) {
    console.error('[QC] Fix error:', error);
  }

  return content;
}

// =============================================================================
// MAIN GENERATION FUNCTION
// =============================================================================

async function generateProductContent(product: ProductPayload): Promise<GeneratedContent> {
  const brand = normalizeBrand(product.vendor);
  
  // Costruisci le trasformazioni JTBD per il prompt
  const jtbdExamples = Object.entries(JTBD_TRANSFORMATIONS)
    .slice(0, 15)
    .map(([spec, benefit]) => `- "${spec}" → "${benefit}"`)
    .join('\n');

  const prompt = `PRODOTTO DA ANALIZZARE:
- Titolo originale: ${product.title}
- Brand: ${brand}
- SKU/Codice: ${product.sku || 'N/A'}
- Barcode/EAN: ${product.barcode || 'N/A'}
- Tipo: ${product.productType || 'Elettroutensile'}

COMPITO:
1. CERCA informazioni dettagliate su questo prodotto specifico:
   - Sito ufficiale ${brand.toLowerCase()}.com / .eu / .it
   - Forum professionisti (edilportale, elettricistaforum)
   - Recensioni reali (non solo 5 stelle, anche 3-4 stelle per problemi)
   - Schede tecniche ufficiali

2. SCRIVI la scheda seguendo la struttura obbligatoria del System Prompt

3. RICORDA le trasformazioni JTBD:
${jtbdExamples}

4. L'OPINIONE DEL TEAM deve:
   - Iniziare con "Noi del team Autonord..." o "Nel nostro laboratorio..."
   - Includere esperienza diretta (es. "abbiamo testato", "i nostri clienti ci dicono")
   - Essere ONESTA su pregi E difetti
   - Dire chiaramente per chi è e per chi NO

FORMATO RISPOSTA (JSON valido):
{
  "title": "Titolo ottimizzato (max 80 char, include brand e codice prodotto)",
  "description": "Descrizione HTML completa seguendo la struttura obbligatoria",
  "expertOpinion": "Opinione del Team Autonord in HTML (2-3 paragrafi)",
  "metaTitle": "Meta title SEO (max 60 char)",
  "metaDescription": "Meta description SEO (max 160 char)",
  "features": ["Feature 1 → Beneficio", "Feature 2 → Beneficio", ...],
  "specifications": ["Spec: valore", ...],
  "useCases": ["Per elettricisti che...", "Per idraulici che...", ...],
  "tags": ["tag1", "tag2", ...]
}

IMPORTANTE:
- Usa SOLO informazioni verificate dalla ricerca
- Se non trovi dati, scrivi "Contattaci per conferma" invece di inventare
- La descrizione deve essere in italiano
- Rispondi SOLO con il JSON`;

  const response = await callClaudeWithWebSearch(prompt);
  
  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const content = JSON.parse(jsonMatch[0]) as GeneratedContent;
      
      // QUALITY CONTROL: Verifica parole vietate
      const allText = `${content.description} ${content.expertOpinion}`;
      const bannedFound = containsBannedPhrases(allText);
      
      if (bannedFound.length > 0) {
        console.log(`[QC] Banned phrases found: ${bannedFound.join(', ')}`);
        return await fixBannedPhrases(content, bannedFound);
      }
      
      // QUALITY CONTROL: Verifica Krug compliance
      const krugCheck = checkKrugCompliance(content.description);
      if (!krugCheck.compliant) {
        console.log(`[QC] Krug issues: ${krugCheck.issues.join(', ')}`);
        // Log warning ma non bloccare
      }
      
      return content;
    }
  } catch (e) {
    console.error('Error parsing Claude response:', e);
  }

  // Fallback
  return {
    title: product.title,
    description: `<p>Prodotto ${brand} professionale. Contatta il team Autonord per una consulenza personalizzata.</p>`,
    expertOpinion: '<p>Noi del team Autonord siamo a disposizione per aiutarti a scegliere il prodotto giusto per le tue esigenze. Chiamaci o passa in negozio.</p>',
    metaTitle: product.title.substring(0, 60),
    metaDescription: `${product.title} - Acquista da Autonord Service, rivenditore autorizzato ${brand} a Genova`,
    features: [],
    specifications: [],
    useCases: [],
    tags: [brand.toLowerCase()],
  };
}

// =============================================================================
// SHOPIFY UPDATE
// =============================================================================

async function updateProductOnShopify(
  productId: string,
  content: GeneratedContent,
  imageUrl: string | null
): Promise<{ success: boolean; error?: string }> {
  const url = `https://${SHOPIFY_STORE}/admin/api/2024-01/graphql.json`;

  // Costruisci la descrizione HTML completa
  const fullDescription = `
    <div class="product-description">
      ${content.description}
      
      ${content.features.length > 0 ? `
      <div class="product-features">
        <h3>Caratteristiche Principali</h3>
        <ul>
          ${content.features.map(f => `<li>${f}</li>`).join('\n')}
        </ul>
      </div>
      ` : ''}
      
      ${content.specifications.length > 0 ? `
      <div class="product-specs">
        <h3>Specifiche Tecniche</h3>
        <ul>
          ${content.specifications.map(s => `<li>${s}</li>`).join('\n')}
        </ul>
      </div>
      ` : ''}
      
      ${content.useCases.length > 0 ? `
      <div class="product-usecases">
        <h3>Applicazioni</h3>
        <ul>
          ${content.useCases.map(u => `<li>${u}</li>`).join('\n')}
        </ul>
      </div>
      ` : ''}
      
      <div class="expert-opinion">
        <h3>💡 Opinione del Team Autonord</h3>
        ${content.expertOpinion}
      </div>
    </div>
  `;

  const updateMutation = `
    mutation productUpdate($input: ProductInput!) {
      productUpdate(input: $input) {
        product {
          id
          title
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const allTags = Array.from(new Set([...content.tags, 'AI-Enhanced', 'TAYA-V3']));

  const updateResponse = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
    },
    body: JSON.stringify({
      query: updateMutation,
      variables: {
        input: {
          id: productId,
          title: content.title,
          handle: sanitizeHandle(content.title),
          descriptionHtml: fullDescription,
          tags: allTags,
          seo: {
            title: content.metaTitle,
            description: content.metaDescription,
          },
        },
      },
    }),
  });

  const updateResult = await updateResponse.json();
  
  if (updateResult.data?.productUpdate?.userErrors?.length > 0) {
    return {
      success: false,
      error: updateResult.data.productUpdate.userErrors[0].message,
    };
  }

  // Se abbiamo un'immagine validata, aggiungila
  if (imageUrl) {
    try {
      const imageMutation = `
        mutation productCreateMedia($productId: ID!, $media: [CreateMediaInput!]!) {
          productCreateMedia(productId: $productId, media: $media) {
            media {
              ... on MediaImage {
                id
              }
            }
            mediaUserErrors {
              field
              message
            }
          }
        }
      `;

      await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
        },
        body: JSON.stringify({
          query: imageMutation,
          variables: {
            productId: productId,
            media: [
              {
                originalSource: imageUrl,
                alt: content.title,
                mediaContentType: 'IMAGE',
              },
            ],
          },
        }),
      });
      
      console.log(`[Worker] Image added: ${imageUrl}`);
    } catch (e) {
      console.error('[Worker] Error adding image:', e);
    }
  }

  return { success: true };
}

// =============================================================================
// MAIN HANDLER
// =============================================================================

export async function POST(request: NextRequest) {
  try {
    // Verifica autorizzazione
    const authHeader = request.headers.get('authorization');
    const upstashSignature = request.headers.get('upstash-signature');
    
    if (!upstashSignature && authHeader !== 'Bearer autonord-cron-2024-xK9mP2vL8nQ4') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload: ProductPayload = await request.json();
    
    if (!payload.productId || !payload.title) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    console.log(`[Worker V3] Processing: ${payload.title}`);

    // 1. Genera contenuto con Claude + System Prompt V3
    console.log('[Worker V3] Step 1: Generating content with TAYA philosophy...');
    const content = await generateProductContent(payload);

    // 2. Cerca immagine con ImageDiscoveryAgent
    console.log('[Worker V3] Step 2: Discovering product image...');
    const imageResult = await discoverProductImage(
      payload.title,
      payload.vendor,
      payload.sku,
      payload.barcode
    );
    
    if (imageResult.success) {
      console.log(`[Worker V3] Image found: ${imageResult.imageUrl}`);
    } else {
      console.log(`[Worker V3] No valid image found: ${imageResult.error}`);
    }

    // 3. Aggiorna il prodotto su Shopify
    console.log('[Worker V3] Step 3: Updating Shopify...');
    const result = await updateProductOnShopify(
      payload.productId,
      content,
      imageResult.imageUrl
    );

    if (!result.success) {
      return NextResponse.json({
        success: false,
        error: result.error,
        product: payload.title,
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      product: payload.title,
      newTitle: content.title,
      hasImage: imageResult.success,
      imageSource: imageResult.source,
      featuresCount: content.features.length,
      specsCount: content.specifications.length,
      version: 'V3-TAYA',
    });

  } catch (error) {
    console.error('[Worker V3] Error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
