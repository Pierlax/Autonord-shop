/**
 * scripts/test-single-product.ts
 *
 * Dry-run test for the full regenerate-product pipeline.
 *
 * Reads the first valid product row from Prodotti-Danea-tutte-le-colonne.xlsx
 * (falls back to test.xlsx if not found), mocks the QStash payload, then
 * executes every step of the V5 enrichment pipeline locally:
 *
 *   hydrateKG → UniversalRAG → RagAdapter → TwoPhaseQA + ImageAgent (parallel)
 *   → AI Enrichment V3 → TAYA Police → flushKG
 *
 * The final Shopify mutation payload is printed to the console.
 * The actual Shopify API call is commented out (DRY-RUN MODE).
 *
 * Run:
 *   npx tsx --tsconfig scripts/tsconfig.json scripts/test-single-product.ts
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import * as fs from 'fs';

// ── 1. Load environment variables ───────────────────────────────────────────
config({ path: resolve(process.cwd(), '.env.local') });

// Verify required env vars before importing anything that reads them
const REQUIRED = [
  'GOOGLE_GENERATIVE_AI_API_KEY',
  'SHOPIFY_ADMIN_ACCESS_TOKEN',
  'CRON_SECRET',
] as const;

for (const key of REQUIRED) {
  if (!process.env[key]) {
    console.error(`\n❌ Missing required env var: ${key}`);
    console.error('   → Set it in .env.local and retry.\n');
    process.exit(1);
  }
}

// ── 2. Imports (after env is loaded) ────────────────────────────────────────
import * as xlsx from 'xlsx';

import { getKnowledgeGraph }          from '@/lib/shopify/knowledge-graph';
import { getKGStore }                 from '@/lib/shopify/kg-store';
import { UniversalRAGPipeline, UniversalRAGResult } from '@/lib/shopify/universal-rag';
import { adaptRagToQa, AdaptationResult }           from '@/lib/shopify/rag-adapter';
import {
  runTwoPhaseQA,
  twoPhaseQAToProductContent,
  TwoPhaseQAResult,
} from '@/lib/shopify/two-phase-qa';
import {
  generateProductContentV3,
  formatDescriptionAsHtmlV3,
  EnrichedProductDataV3,
} from '@/lib/shopify/ai-enrichment-v3';
import { validateAndCorrect, CleanedContent } from '@/lib/agents/taya-police';
import { findProductImage, ImageAgentV4Result }     from '@/lib/agents/image-agent-v4';
import { ShopifyProductWebhookPayload }             from '@/lib/shopify/webhook-types';
import { formatProvenanceDisplay }                  from '@/lib/shopify/provenance-tracking';
import { toShopifyGid }                             from '@/lib/env';

// ── 3. Types ─────────────────────────────────────────────────────────────────

interface WorkerPayload {
  productId:   string;
  title:       string;
  vendor:      string;
  productType: string;
  sku:         string | null;
  barcode:     string | null;
  tags:        string[];
  price?:      string;
  hasImages?:  boolean;
  receivedAt?: string;
}

interface XlsxRow {
  'Descrizione'?:    string;
  'Produttore'?:     string;
  'E-commerce'?:     string;
  'Cod.'?:           string;
  'Cod per il F.'?:  string;
  'Prezzo forn.'?:   number | string;
  [key: string]: unknown;
}

// ── 4. Read xlsx ─────────────────────────────────────────────────────────────

function findXlsx(): string {
  const candidates = [
    resolve(process.cwd(), 'Prodotti-Danea-tutte-le-colonne.xlsx'),
    resolve(process.cwd(), 'test.xlsx'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error(
    'No xlsx found. Expected Prodotti-Danea-tutte-le-colonne.xlsx or test.xlsx in the project root.'
  );
}

function readRandomValidRow(): XlsxRow {
  const xlsxPath = findXlsx();
  console.log(`\n📂 Reading xlsx: ${xlsxPath}`);

  const wb   = xlsx.readFile(xlsxPath);
  const ws   = wb.Sheets[wb.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json<XlsxRow>(ws);

  console.log(`   Total rows: ${rows.length}`);

  const valid = rows.filter(r =>
    r['E-commerce'] === 'Sì' &&
    typeof r['Descrizione'] === 'string' && r['Descrizione'].trim().length > 5 &&
    typeof r['Produttore']  === 'string' && r['Produttore'].trim().length > 2
  );

  if (valid.length === 0) {
    throw new Error('No valid rows found (E-commerce=Sì, with Descrizione and Produttore).');
  }

  const idx = Math.floor(Math.random() * valid.length);
  console.log(`   Valid rows: ${valid.length} — picked index ${idx}`);
  return valid[idx];
}

// ── 5. Map xlsx row → WorkerPayload ─────────────────────────────────────────

function toWorkerPayload(row: XlsxRow, index = 0): WorkerPayload {
  const sku     = (String(row['Cod.'] || `TEST-${index}`)).trim();
  const barcode = (String(row['Cod per il F.'] || '')).trim() || null;
  return {
    productId:   `DRY-RUN-${sku}`,
    title:       String(row['Descrizione']).trim(),
    vendor:      String(row['Produttore']).trim(),
    productType: 'Utensili e Attrezzatura',
    sku,
    barcode,
    tags:        ['test-dry-run', 'danea-sync'],
    price:       String(row['Prezzo forn.'] ?? '0'),
    hasImages:   false,
    receivedAt:  new Date().toISOString(),
  };
}

// ── 6. Worker helpers (copied from regenerate-product/route.ts) ──────────────

function sanitizeHandle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[™®©]/g, '')
    .replace(/[àáâãäå]/g, 'a')
    .replace(/[èéêë]/g, 'e')
    .replace(/[ìíîï]/g, 'i')
    .replace(/[òóôõö]/g, 'o')
    .replace(/[ùúûü]/g, 'u')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 100);
}

function toWebhookPayload(p: WorkerPayload): ShopifyProductWebhookPayload {
  return {
    id: 0,
    title: p.title,
    body_html: null,
    vendor: p.vendor,
    product_type: p.productType || '',
    created_at: new Date().toISOString(),
    handle: sanitizeHandle(p.title),
    updated_at: new Date().toISOString(),
    published_at: new Date().toISOString(),
    template_suffix: null,
    published_scope: 'global',
    tags: p.tags.join(', '),
    status: 'active',
    admin_graphql_api_id: p.productId,
    variants: [{
      id: 0, product_id: 0, title: 'Default', price: p.price || '0',
      sku: p.sku || '', position: 1, inventory_policy: 'deny',
      compare_at_price: null, fulfillment_service: 'manual',
      inventory_management: null, option1: null, option2: null, option3: null,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      taxable: true, barcode: p.barcode, grams: 0, weight: 0, weight_unit: 'kg',
      inventory_item_id: 0, inventory_quantity: 0, old_inventory_quantity: 0,
      requires_shipping: true, admin_graphql_api_id: '',
    }],
    options: [], images: [], image: null,
  };
}

function extractSpecsFromV3(enrichedData: EnrichedProductDataV3): Record<string, string> {
  const specs: Record<string, string> = {};
  if (enrichedData.provenance?.facts) {
    for (const fact of enrichedData.provenance.facts) {
      if (
        fact.verificationStatus === 'verified' &&
        !fact.factKey.startsWith('Source queried:') &&
        !fact.factKey.startsWith('RAG Evidence') &&
        fact.factValue !== 'RAG pipeline source'
      ) {
        specs[fact.factKey] = fact.factValue;
      }
    }
  }
  return specs;
}

function mergeSpecs(
  qaSpecs: Record<string, string>,
  v3Specs: Record<string, string>
): Record<string, string> {
  return { ...v3Specs, ...qaSpecs };
}

function generateExpertOpinion(
  cleanedContent: CleanedContent,
  enrichedData: EnrichedProductDataV3,
  qaVerdict?: string
): string {
  const trades = enrichedData.knowledgeGraphContext?.suitableForTrades || [];
  const tradesText = trades.length > 0 ? `Ideale per: ${trades.join(', ')}.` : '';
  if (qaVerdict) return `${tradesText} ${qaVerdict}`.trim();
  const prosText = cleanedContent.pros.slice(0, 2).join('. ');
  const consText = cleanedContent.cons.length > 0 ? `Da considerare: ${cleanedContent.cons[0]}.` : '';
  return `${tradesText} ${prosText}. ${consText}`.trim();
}

// ── 7. Build Shopify mutation payload (dry-run) ───────────────────────────────

function buildShopifyPayload(
  productGid:     string,
  enrichedData:   EnrichedProductDataV3,
  cleanedContent: CleanedContent,
  imageResult:    ImageAgentV4Result,
  vendor:         string,
  productType:    string,
  qaSpecs?:       Record<string, string>,
  qaVerdict?:     string,
  suitableFor?:   string[],
  notSuitableFor?: string[],
) {
  const descriptionHtml = formatDescriptionAsHtmlV3({
    ...enrichedData,
    description: cleanedContent.description,
    pros:        cleanedContent.pros,
    cons:        cleanedContent.cons,
    faqs:        cleanedContent.faqs,
  });

  const seoTitle       = cleanedContent.description.substring(0, 60);
  const seoDescription = cleanedContent.description.substring(0, 160);
  const tags           = ['AI-Enhanced', 'TAYA-V5', 'DRY-RUN'];

  const v3Specs     = extractSpecsFromV3(enrichedData);
  const specs       = qaSpecs ? mergeSpecs(qaSpecs, v3Specs) : v3Specs;
  const expertOpinion = cleanedContent.expertOpinion ||
    generateExpertOpinion(cleanedContent, enrichedData, qaVerdict);

  return {
    id: productGid,
    descriptionHtml,
    vendor,
    productType,
    status: 'ACTIVE',
    tags,
    seo: { title: seoTitle, description: seoDescription },
    metafields: [
      { namespace: 'taya', key: 'pros',           type: 'list.single_line_text_field', value: JSON.stringify(cleanedContent.pros) },
      { namespace: 'taya', key: 'cons',           type: 'list.single_line_text_field', value: JSON.stringify(cleanedContent.cons) },
      { namespace: 'taya', key: 'specs',          type: 'json',                        value: JSON.stringify(specs) },
      { namespace: 'taya', key: 'expert_opinion', type: 'multi_line_text_field',       value: expertOpinion },
      { namespace: 'taya', key: 'faqs',           type: 'json',                        value: JSON.stringify(cleanedContent.faqs) },
      { namespace: 'taya', key: 'confidence',     type: 'number_integer',              value: String(enrichedData.provenance?.overallConfidence || 0) },
      { namespace: 'taya', key: 'generated_at',   type: 'date_time',                  value: new Date().toISOString() },
      { namespace: 'taya', key: 'accessories',    type: 'json',                        value: JSON.stringify(enrichedData.accessories || []) },
      { namespace: 'taya', key: 'suitable_for',   type: 'list.single_line_text_field', value: JSON.stringify(suitableFor || []) },
      { namespace: 'taya', key: 'not_suitable_for', type: 'list.single_line_text_field', value: JSON.stringify(notSuitableFor || []) },
      { namespace: 'taya', key: 'sources_used',   type: 'list.single_line_text_field', value: JSON.stringify(enrichedData.sourcesUsed || []) },
      { namespace: 'taya', key: 'image_source',   type: 'single_line_text_field',      value: imageResult.source || '' },
      { namespace: 'taya', key: 'image_confidence', type: 'single_line_text_field',    value: imageResult.confidence },
      { namespace: 'taya', key: 'trust_badge',    type: 'multi_line_text_field',       value: formatProvenanceDisplay(enrichedData.provenance) },
    ],
  };
}

// ── 8. Main ───────────────────────────────────────────────────────────────────

async function main() {
  const startTime = Date.now();
  console.log('\n🚀 DRY-RUN: regenerate-product pipeline\n');

  // --- Read xlsx ---
  const row     = readRandomValidRow();
  const payload = toWorkerPayload(row);

  console.log(`\n📦 Product: "${payload.title}"`);
  console.log(`   Vendor:  ${payload.vendor}`);
  console.log(`   SKU:     ${payload.sku}`);
  console.log(`   Barcode: ${payload.barcode ?? '(none)'}`);
  console.log(`   GID:     ${toShopifyGid(payload.productId, 'Product')} [dry-run]`);

  // --- KG Hydrate ---
  console.log('\n[Step 0] Hydrating Knowledge Graph from Redis...');
  const kg      = getKnowledgeGraph();
  const kgStore = getKGStore();
  await kgStore.hydrateKG(kg);
  console.log('   ✅ KG hydrated');

  // --- Step 1: UniversalRAG ---
  console.log('\n[Step 1] Running UniversalRAG...');
  const ragPipeline = new UniversalRAGPipeline({
    enableSourceRouting:       true,
    enableGranularityAware:    true,
    enableNoRetrievalDetection: true,
    enableProactiveFusion:     true,
    enableBenchmarkContext:    true,
    maxSources:     5,
    maxTokenBudget: 6000,
    timeoutMs:      30000,
  });

  const ragResult: UniversalRAGResult = await ragPipeline.enrichProduct(
    payload.title,
    payload.vendor,
    payload.productType || '',
    payload.sku || '',
    'full'
  );

  console.log(`   ✅ RAG: success=${ragResult.success}, sources=${ragResult.metadata.sourcesQueried.length}, tokens=${ragResult.metadata.tokensUsed}`);
  console.log(`   📄 RAG page URLs: ${ragResult.ragPageUrls?.length ?? 0}`);

  // --- Step 2: RagAdapter ---
  console.log('\n[Step 2] Adapting RAG → TwoPhaseQA...');
  const adaptation: AdaptationResult = adaptRagToQa(
    ragResult,
    payload.title,
    payload.vendor,
    payload.sku || '',
    payload.productType || ''
  );
  console.log(`   ✅ Adapter: evidence=${adaptation.metadata.evidenceCount}, sources=${adaptation.metadata.contributingSources.join(',')}`);
  if (adaptation.metadata.warnings.length > 0) {
    console.log(`   ⚠️  Warnings: ${adaptation.metadata.warnings.join('; ')}`);
  }

  // --- Steps 3+6: TwoPhaseQA + ImageAgent (parallel) ---
  console.log('\n[Steps 3+6] TwoPhaseQA + ImageAgent V4 (parallel)...');

  const [qaOutput, imageResult] = await Promise.all([
    // TwoPhaseQA
    (async () => {
      const hasEnoughData = (adaptation.qaInput?.sourceData?.length ?? 0) > 100;
      if (!hasEnoughData) {
        console.log('   [QA] Skipped (insufficient sourceData)');
        return { qaResult: null as TwoPhaseQAResult | null, qaContent: null as ReturnType<typeof twoPhaseQAToProductContent> | null };
      }
      try {
        const result  = await runTwoPhaseQA(adaptation.qaInput);
        const content = twoPhaseQAToProductContent(result);
        console.log(`   [QA] ✅ ${result.simpleQA.rawFacts.filter(f => f.verified).length} verified facts, confidence=${result.complexQA.recommendation.confidence}`);
        return { qaResult: result, qaContent: content };
      } catch (err) {
        console.error('   [QA] Failed (non-fatal):', err instanceof Error ? err.message : err);
        return { qaResult: null as TwoPhaseQAResult | null, qaContent: null as ReturnType<typeof twoPhaseQAToProductContent> | null };
      }
    })(),
    // ImageAgent V4
    findProductImage(
      payload.title,
      payload.vendor,
      payload.sku,
      payload.barcode,
      ragResult.ragPageUrls,
      ragResult.visualClues
    ).then(result => {
      if (result.success) {
        console.log(`   [Image] ✅ Found via ${result.method}: ${result.source}`);
        console.log(`            ALT: "${result.imageAlt}"`);
      } else {
        console.log(`   [Image] ❌ Not found after ${result.searchAttempts} attempts: ${result.error}`);
      }
      return result;
    }),
  ]);

  const { qaResult, qaContent } = qaOutput;

  // --- Step 4: AI Enrichment V3 ---
  console.log('\n[Step 4] Running AI Enrichment V3...');
  const webhookPayload  = toWebhookPayload(payload);
  const enrichedData    = await generateProductContentV3(webhookPayload, ragResult, qaResult);
  console.log(`   ✅ V3 confidence: ${enrichedData.provenance.overallConfidence}%`);
  console.log(`   📚 Sources used: ${enrichedData.sourcesUsed.join(', ') || '(none)'}`);

  // --- Step 5: TAYA Police ---
  console.log('\n[Step 5] Running TAYA Police...');
  const prosToValidate = qaContent
    ? [...qaContent.pros, ...enrichedData.pros.filter(p => !qaContent!.pros.some(qp => qp.includes(p.substring(0, 20))))]
    : enrichedData.pros;
  const consToValidate = qaContent
    ? [...qaContent.cons, ...enrichedData.cons.filter(c => !qaContent!.cons.some(qc => qc.includes(c.substring(0, 20))))]
    : enrichedData.cons;

  const validationResult = await validateAndCorrect({
    description: enrichedData.description,
    pros:        prosToValidate,
    cons:        consToValidate,
    faqs:        enrichedData.faqs,
  });

  if (validationResult.wasFixed) {
    console.log(`   ✅ TAYA fixed ${validationResult.violations.length} violations`);
  } else {
    console.log('   ✅ TAYA: content passed');
  }

  // --- KG Flush ---
  console.log('\n[Step KG] Flushing Knowledge Graph to Redis...');
  await kgStore.flushKG(kg);
  console.log('   ✅ KG flushed');

  // --- Build Shopify payload ---
  const productGid    = toShopifyGid(payload.productId, 'Product');
  const shopifyInput  = buildShopifyPayload(
    productGid,
    enrichedData,
    validationResult.content,
    imageResult,
    payload.vendor,
    payload.productType || '',
    qaContent?.specs,
    qaContent?.verdict,
    qaResult?.complexQA.suitability.idealFor,
    qaResult?.complexQA.suitability.notIdealFor,
  );

  // ─────────────────────────────────────────────────────────────────────────
  // DRY-RUN: Shopify API call is commented out. Remove comment to go live.
  // ─────────────────────────────────────────────────────────────────────────
  //
  // const response = await fetch(
  //   `https://autonord-service.myshopify.com/admin/api/2024-01/graphql.json`,
  //   {
  //     method: 'POST',
  //     headers: {
  //       'Content-Type': 'application/json',
  //       'X-Shopify-Access-Token': process.env.SHOPIFY_ADMIN_ACCESS_TOKEN!,
  //     },
  //     body: JSON.stringify({
  //       query: `mutation productUpdate($input: ProductInput!) {
  //         productUpdate(input: $input) {
  //           product { id title }
  //           userErrors { field message }
  //         }
  //       }`,
  //       variables: { input: shopifyInput },
  //     }),
  //   }
  // );
  // const result = await response.json();
  // console.log('[Shopify] Result:', JSON.stringify(result, null, 2));

  // ─────────────────────────────────────────────────────────────────────────
  // FINAL OUTPUT
  // ─────────────────────────────────────────────────────────────────────────

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log('\n' + '═'.repeat(72));
  console.log('✅  PIPELINE COMPLETE — DRY-RUN PAYLOAD FOLLOWS');
  console.log('═'.repeat(72) + '\n');

  // Human-readable summary
  console.log(`Product   : ${payload.title}`);
  console.log(`Vendor    : ${payload.vendor}`);
  console.log(`GID       : ${productGid} (dry-run placeholder)`);
  console.log(`Confidence: ${enrichedData.provenance.overallConfidence}%`);
  console.log(`Time      : ${elapsed}s`);
  console.log(`TAYA fixes: ${validationResult.violations.length}`);
  console.log(`Image     : ${imageResult.success ? imageResult.imageUrl : '(none)'}`);
  console.log(`Image ALT : ${imageResult.imageAlt ?? '(none)'}`);

  console.log('\n--- descriptionHtml (first 800 chars) ---');
  console.log(shopifyInput.descriptionHtml.substring(0, 800) + (shopifyInput.descriptionHtml.length > 800 ? '…' : ''));

  console.log('\n--- Pros ---');
  validationResult.content.pros.forEach((p, i) => console.log(`  ${i + 1}. ${p}`));

  console.log('\n--- Cons ---');
  validationResult.content.cons.forEach((c, i) => console.log(`  ${i + 1}. ${c}`));

  console.log('\n--- FAQs ---');
  validationResult.content.faqs.forEach((f, i) => console.log(`  Q${i + 1}: ${f.question}\n      ${f.answer}`));

  console.log('\n--- Specs (metafield taya.specs) ---');
  const specs = JSON.parse(shopifyInput.metafields.find(m => m.key === 'specs')!.value);
  Object.entries(specs).forEach(([k, v]) => console.log(`  ${k}: ${v}`));

  console.log('\n--- Expert Opinion ---');
  console.log(' ', shopifyInput.metafields.find(m => m.key === 'expert_opinion')?.value);

  console.log('\n--- Full Shopify Input (JSON) ---');
  console.log(JSON.stringify(shopifyInput, null, 2));

  console.log('\n' + '═'.repeat(72));
  console.log('DRY-RUN complete. No changes written to Shopify.');
  console.log('To go live: uncomment the fetch() block in this script.');
  console.log('═'.repeat(72) + '\n');
}

main().catch(err => {
  console.error('\n💥 Fatal error:', err);
  process.exit(1);
});
