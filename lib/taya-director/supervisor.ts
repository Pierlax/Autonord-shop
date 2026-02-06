/**
 * TAYA Director - Supervisor Module (The Editor)
 * 
 * Evaluates content quality against TAYA principles:
 * - Honesty: No exaggeration, admits limitations
 * - Clarity: Easy to understand, no jargon
 * - No Fluff: Every sentence adds value
 * - Actionability: Helps customer decide
 */

import { generateTextSafe } from '@/lib/shopify/ai-client';
import { loggers } from '@/lib/logger';

const log = loggers.taya;
import {
  QualityScore,
  QualityEvaluation,
  QualityIssue,
  DirectorProduct,
  DirectorConfig,
  DEFAULT_CONFIG,
} from './types';
import {
  AGENT_4_DIRECTOR_DIRECTIVE,
  containsBannedPhrases,
  checkKrugCompliance,
  BANNED_PHRASES,
} from '../core-philosophy';
/**
 * Evaluate a single product's content quality
 */
export async function evaluateProductQuality(
  product: DirectorProduct,
  config: DirectorConfig = DEFAULT_CONFIG
): Promise<QualityEvaluation> {
  // Build content to evaluate
  const contentToEvaluate = buildContentString(product);

  // The Pragmatic Truth Philosophy for Director/Evaluator
  const systemPrompt = `${AGENT_4_DIRECTOR_DIRECTIVE}

---

## RUOLO: EDITOR QUALITÀ

Sei un editor esperto che valuta i contenuti usando il "Test della Triade".
Il tuo compito è verificare che ogni contenuto rispetti TAYA + KRUG + JTBD.

## TEST DELLA TRIADE - CHECKLIST

### TEST TAYA (Onestà)
- Il contenuto menziona almeno 1 difetto/limite reale?
- Evita parole vietate: "leader di settore", "eccellenza", "qualità superiore", "il migliore", "straordinario", "eccezionale", "perfetto"?
- Confronta onestamente con alternative?
- Parla di prezzo senza nasconderlo?

### TEST KRUG (Chiarezza)
- L'informazione chiave è nei primi 5 secondi di lettura?
- Formato scannable (bullet, grassetti, tabelle)?
- Nessuna frase > 20 parole?
- Gerarchia visiva chiara?

### TEST JTBD (Rilevanza)
- Collega specs a benefici lavorativi?
- Specifica "per chi" e "non per chi"?
- Contestualizza nel lavoro reale?

RISPONDI IN JSON con questo schema esatto:
{
  "scores": {
    "tayaCompliance": <0-100>,
    "readability": <0-100>,
    "uniqueness": <0-100>,
    "actionability": <0-100>
  },
  "issues": [
    {
      "type": "taya_violation" | "readability" | "generic_content" | "missing_info",
      "severity": "low" | "medium" | "high",
      "description": "Descrizione del problema",
      "suggestion": "Come migliorare"
    }
  ],
  "summary": "Breve valutazione complessiva (1-2 frasi)"
}`;

  const userPrompt = `Valuta questo contenuto prodotto:

TITOLO: ${product.title}
CATEGORIA: ${product.productType}
BRAND: ${product.vendor}

DESCRIZIONE HTML:
${product.bodyHtml || '(vuota)'}

PRO:
${product.metafields.pros?.join('\n') || '(non presenti)'}

CONTRO:
${product.metafields.cons?.join('\n') || '(non presenti)'}

FAQ:
${product.metafields.faqs || '(non presenti)'}

DESCRIZIONE AI:
${product.metafields.aiDescription || '(non presente)'}

---
Valuta secondo i principi TAYA e rispondi SOLO con il JSON richiesto.`;

  try {
    const response = await generateTextSafe({
      prompt,
      maxTokens: 1500,
      temperature: 0.5,
    });
    // Extract text response
    const textBlock = response.content.find(block => block.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      throw new Error('No text response from Claude');
    }

    // Parse JSON from response
    const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }

    const evaluation = JSON.parse(jsonMatch[0]);

    // Calculate overall score with weights
    const scores = evaluation.scores;
    const weights = config.scoreWeights;
    const overall = Math.round(
      scores.tayaCompliance * weights.tayaCompliance +
      scores.readability * weights.readability +
      scores.uniqueness * weights.uniqueness +
      scores.actionability * weights.actionability
    );

    const qualityScore: QualityScore = {
      tayaCompliance: scores.tayaCompliance,
      readability: scores.readability,
      uniqueness: scores.uniqueness,
      actionability: scores.actionability,
      overall,
    };

    return {
      productId: product.id,
      productHandle: product.handle,
      score: qualityScore,
      passed: overall >= config.minQualityScore,
      issues: evaluation.issues || [],
      evaluatedAt: new Date().toISOString(),
    };

  } catch (error) {
    log.error(`Error evaluating product ${product.handle}:`, error);
    
    // Return a failed evaluation
    return {
      productId: product.id,
      productHandle: product.handle,
      score: {
        tayaCompliance: 0,
        readability: 0,
        uniqueness: 0,
        actionability: 0,
        overall: 0,
      },
      passed: false,
      issues: [{
        type: 'missing_info',
        severity: 'high',
        description: 'Impossibile valutare il contenuto',
        suggestion: 'Verificare che il prodotto abbia contenuti da valutare',
      }],
      evaluatedAt: new Date().toISOString(),
    };
  }
}

/**
 * Evaluate multiple products and return results
 */
export async function evaluateProducts(
  products: DirectorProduct[],
  config: DirectorConfig = DEFAULT_CONFIG
): Promise<QualityEvaluation[]> {
  const results: QualityEvaluation[] = [];

  for (const product of products) {
    // Only evaluate products that have AI-enhanced content
    if (!product.hasAiEnhanced) {
      log.info(`Skipping ${product.handle}: not AI-enhanced yet`);
      continue;
    }

    log.info(`Evaluating: ${product.handle}`);
    const evaluation = await evaluateProductQuality(product, config);
    results.push(evaluation);

    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  return results;
}

/**
 * Generate a stricter prompt for re-enrichment based on issues
 */
export function generateReEnrichmentPrompt(evaluation: QualityEvaluation): string {
  const issueDescriptions = evaluation.issues
    .filter(i => i.severity !== 'low')
    .map(i => `- ${i.description}: ${i.suggestion}`)
    .join('\n');

  return `ATTENZIONE: Il contenuto precedente non ha superato il controllo qualità TAYA.

PROBLEMI IDENTIFICATI:
${issueDescriptions}

PUNTEGGIO PRECEDENTE: ${evaluation.score.overall}/100

ISTRUZIONI SEVERE:
1. NON usare superlativi vuoti (eccellente, straordinario, il migliore)
2. DEVI includere almeno 1 difetto o limitazione reale
3. Scrivi come se stessi consigliando un amico, non vendendo
4. Ogni frase deve aggiungere informazione utile
5. Se non conosci un dettaglio, NON inventarlo

Il contenuto deve aiutare il cliente a capire SE questo prodotto fa per lui, non convincerlo a comprare.`;
}

/**
 * Build a string of all content to evaluate
 */
function buildContentString(product: DirectorProduct): string {
  const parts: string[] = [];

  if (product.bodyHtml) {
    // Strip HTML tags for evaluation
    const textContent = product.bodyHtml.replace(/<[^>]*>/g, ' ').trim();
    parts.push(`Descrizione: ${textContent}`);
  }

  if (product.metafields.pros?.length) {
    parts.push(`Pro: ${product.metafields.pros.join(', ')}`);
  }

  if (product.metafields.cons?.length) {
    parts.push(`Contro: ${product.metafields.cons.join(', ')}`);
  }

  if (product.metafields.aiDescription) {
    parts.push(`AI Description: ${product.metafields.aiDescription}`);
  }

  return parts.join('\n\n');
}

/**
 * Quick check if content needs evaluation
 */
export function needsEvaluation(product: DirectorProduct): boolean {
  // Must have AI-enhanced tag
  if (!product.hasAiEnhanced) return false;

  // Must have some content to evaluate
  const hasContent = 
    (product.bodyHtml?.length ?? 0) > 100 ||
    (product.metafields.pros?.length ?? 0) > 0 ||
    !!product.metafields.aiDescription;

  return hasContent;
}

/**
 * Get summary statistics from evaluations
 */
export function getEvaluationStats(evaluations: QualityEvaluation[]): {
  total: number;
  passed: number;
  failed: number;
  averageScore: number;
  commonIssues: { type: string; count: number }[];
} {
  const passed = evaluations.filter(e => e.passed).length;
  const failed = evaluations.length - passed;
  const averageScore = evaluations.length > 0
    ? Math.round(evaluations.reduce((sum, e) => sum + e.score.overall, 0) / evaluations.length)
    : 0;

  // Count issue types
  const issueCounts: Record<string, number> = {};
  for (const evaluation of evaluations) {
    for (const issue of evaluation.issues) {
      issueCounts[issue.type] = (issueCounts[issue.type] || 0) + 1;
    }
  }

  const commonIssues = Object.entries(issueCounts)
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count);

  return {
    total: evaluations.length,
    passed,
    failed,
    averageScore,
    commonIssues,
  };
}
