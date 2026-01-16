/**
 * Content Verifier Module (CLaRa-Inspired)
 * 
 * Implements the Verification & Regeneration pattern from the CLaRa paper:
 * - Verify factual consistency between generated content and source data
 * - Check information coverage (are all key facts included?)
 * - Regenerate with specific feedback if verification fails
 * 
 * Benefits:
 * - Self-correcting content loop
 * - More complete and accurate content
 * - Reduced hallucinations
 */

import Anthropic from '@anthropic-ai/sdk';
import { loggers } from '@/lib/logger';

const log = loggers.taya;

// ============================================================================
// Types
// ============================================================================

export interface VerificationResult {
  passed: boolean;
  factCoverage: {
    score: number; // 0-100
    missingFacts: string[];
    coveredFacts: string[];
  };
  factualConsistency: {
    score: number; // 0-100
    inconsistencies: FactInconsistency[];
    verifiedClaims: string[];
  };
  overallScore: number; // 0-100
  feedback: string[];
  shouldRegenerate: boolean;
}

export interface FactInconsistency {
  claim: string;
  sourceValue: string;
  generatedValue: string;
  severity: 'critical' | 'major' | 'minor';
}

export interface RegenerationRequest {
  originalContent: GeneratedContent;
  verification: VerificationResult;
  sourceData: SourceData;
  attempt: number;
  maxAttempts: number;
}

export interface GeneratedContent {
  description: string;
  pros: string[];
  cons: string[];
  faqs: Array<{ question: string; answer: string }>;
  idealFor: string[];
  notIdealFor: string[];
}

export interface SourceData {
  title: string;
  brand: string;
  sku: string;
  rawSpecs: Record<string, string>;
  researchData: string;
  verifiedFacts: string[];
}

// ============================================================================
// Fact Coverage Check
// ============================================================================

export async function checkFactCoverage(
  content: GeneratedContent,
  sourceData: SourceData,
  anthropic: Anthropic
): Promise<VerificationResult['factCoverage']> {
  
  const prompt = `Sei un verificatore di contenuti. Devi controllare se il contenuto generato copre tutti i fatti importanti.

DATI SORGENTE (Fatti Verificati):
${sourceData.verifiedFacts.map((f, i) => `${i + 1}. ${f}`).join('\n')}

SPECIFICHE TECNICHE:
${Object.entries(sourceData.rawSpecs).map(([k, v]) => `- ${k}: ${v}`).join('\n')}

---

CONTENUTO GENERATO:

Descrizione: ${content.description}

Pro:
${content.pros.map(p => `- ${p}`).join('\n')}

Contro:
${content.cons.map(c => `- ${c}`).join('\n')}

FAQ:
${content.faqs.map(f => `Q: ${f.question}\nA: ${f.answer}`).join('\n\n')}

---

ANALISI RICHIESTA:
1. Quali fatti importanti dalla sorgente sono COPERTI nel contenuto?
2. Quali fatti importanti MANCANO?
3. Dai un punteggio di copertura 0-100.

Rispondi in JSON:
{
  "coveredFacts": ["fatto 1 coperto", "fatto 2 coperto"],
  "missingFacts": ["fatto importante mancante 1", "fatto importante mancante 2"],
  "score": 85
}`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1500,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content[0];
  if (text.type !== 'text') {
    throw new Error('Unexpected response type');
  }

  try {
    const jsonMatch = text.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found');
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      score: parsed.score || 0,
      missingFacts: parsed.missingFacts || [],
      coveredFacts: parsed.coveredFacts || [],
    };
  } catch {
    log.error('Failed to parse fact coverage response');
    return { score: 50, missingFacts: [], coveredFacts: [] };
  }
}

// ============================================================================
// Factual Consistency Check
// ============================================================================

export async function checkFactualConsistency(
  content: GeneratedContent,
  sourceData: SourceData,
  anthropic: Anthropic
): Promise<VerificationResult['factualConsistency']> {
  
  const prompt = `Sei un fact-checker esperto. Devi verificare che il contenuto generato sia CONSISTENTE con i dati sorgente.

DATI SORGENTE (Verità):
${Object.entries(sourceData.rawSpecs).map(([k, v]) => `- ${k}: ${v}`).join('\n')}

Fatti verificati:
${sourceData.verifiedFacts.map((f, i) => `${i + 1}. ${f}`).join('\n')}

---

CONTENUTO DA VERIFICARE:

Descrizione: ${content.description}

Pro:
${content.pros.map(p => `- ${p}`).join('\n')}

Contro:
${content.cons.map(c => `- ${c}`).join('\n')}

---

VERIFICA:
1. Trova TUTTE le affermazioni nel contenuto che contengono numeri o specifiche tecniche
2. Confronta con i dati sorgente
3. Identifica INCONSISTENZE (valori diversi dalla sorgente)
4. Classifica la gravità: critical (numero sbagliato), major (esagerazione), minor (imprecisione)

Rispondi in JSON:
{
  "verifiedClaims": ["affermazione 1 corretta", "affermazione 2 corretta"],
  "inconsistencies": [
    {
      "claim": "l'affermazione nel contenuto",
      "sourceValue": "valore corretto dalla sorgente",
      "generatedValue": "valore sbagliato nel contenuto",
      "severity": "critical|major|minor"
    }
  ],
  "score": 90
}`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1500,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content[0];
  if (text.type !== 'text') {
    throw new Error('Unexpected response type');
  }

  try {
    const jsonMatch = text.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found');
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      score: parsed.score || 0,
      inconsistencies: parsed.inconsistencies || [],
      verifiedClaims: parsed.verifiedClaims || [],
    };
  } catch {
    log.error('Failed to parse consistency response');
    return { score: 50, inconsistencies: [], verifiedClaims: [] };
  }
}

// ============================================================================
// Full Verification
// ============================================================================

export async function verifyContent(
  content: GeneratedContent,
  sourceData: SourceData,
  anthropic: Anthropic,
  thresholds = { coverage: 70, consistency: 80, overall: 75 }
): Promise<VerificationResult> {
  
  log.info(`[Verifier] Starting verification for ${sourceData.sku}`);

  // Run both checks in parallel
  const [factCoverage, factualConsistency] = await Promise.all([
    checkFactCoverage(content, sourceData, anthropic),
    checkFactualConsistency(content, sourceData, anthropic),
  ]);

  // Calculate overall score (weighted)
  const overallScore = Math.round(
    factCoverage.score * 0.4 + factualConsistency.score * 0.6
  );

  // Generate feedback
  const feedback: string[] = [];
  
  if (factCoverage.missingFacts.length > 0) {
    feedback.push(`MANCANO questi fatti importanti: ${factCoverage.missingFacts.join(', ')}`);
  }
  
  if (factualConsistency.inconsistencies.length > 0) {
    const critical = factualConsistency.inconsistencies.filter(i => i.severity === 'critical');
    if (critical.length > 0) {
      feedback.push(`ERRORI CRITICI: ${critical.map(i => `"${i.claim}" dovrebbe essere "${i.sourceValue}"`).join('; ')}`);
    }
  }

  // Determine if regeneration is needed
  const shouldRegenerate = 
    overallScore < thresholds.overall ||
    factCoverage.score < thresholds.coverage ||
    factualConsistency.score < thresholds.consistency ||
    factualConsistency.inconsistencies.some(i => i.severity === 'critical');

  const result: VerificationResult = {
    passed: !shouldRegenerate,
    factCoverage,
    factualConsistency,
    overallScore,
    feedback,
    shouldRegenerate,
  };

  log.info(`[Verifier] Result: passed=${result.passed}, score=${overallScore}, shouldRegenerate=${shouldRegenerate}`);

  return result;
}

// ============================================================================
// Regeneration with Feedback
// ============================================================================

export async function regenerateWithFeedback(
  request: RegenerationRequest,
  anthropic: Anthropic
): Promise<GeneratedContent> {
  
  log.info(`[Verifier] Regenerating content (attempt ${request.attempt}/${request.maxAttempts})`);

  const { originalContent, verification, sourceData } = request;

  const prompt = `Sei Marco, tecnico commerciale esperto. Devi CORREGGERE e MIGLIORARE questo contenuto.

PRODOTTO: ${sourceData.title}
BRAND: ${sourceData.brand}

---

CONTENUTO ORIGINALE (DA CORREGGERE):

Descrizione: ${originalContent.description}

Pro:
${originalContent.pros.map(p => `- ${p}`).join('\n')}

Contro:
${originalContent.cons.map(c => `- ${c}`).join('\n')}

---

PROBLEMI IDENTIFICATI:

${verification.feedback.map((f, i) => `${i + 1}. ${f}`).join('\n')}

Punteggio copertura fatti: ${verification.factCoverage.score}/100
Punteggio consistenza: ${verification.factualConsistency.score}/100

${verification.factCoverage.missingFacts.length > 0 ? `
FATTI MANCANTI DA AGGIUNGERE:
${verification.factCoverage.missingFacts.map(f => `- ${f}`).join('\n')}
` : ''}

${verification.factualConsistency.inconsistencies.length > 0 ? `
ERRORI DA CORREGGERE:
${verification.factualConsistency.inconsistencies.map(i => 
  `- "${i.claim}" → CORREGGI IN: "${i.sourceValue}"`
).join('\n')}
` : ''}

---

DATI CORRETTI (USA QUESTI):
${Object.entries(sourceData.rawSpecs).map(([k, v]) => `- ${k}: ${v}`).join('\n')}

---

GENERA IL CONTENUTO CORRETTO in JSON:
{
  "description": "descrizione corretta con fatti verificati",
  "pros": ["pro 1 con dato corretto", "pro 2 con dato corretto", "pro 3"],
  "cons": ["contro 1 onesto", "contro 2 onesto"],
  "faqs": [
    {"question": "domanda 1", "answer": "risposta con dati corretti"},
    {"question": "domanda 2", "answer": "risposta con dati corretti"}
  ],
  "idealFor": ["tipo utente 1", "tipo utente 2"],
  "notIdealFor": ["tipo utente 1", "tipo utente 2"]
}`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 3000,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content[0];
  if (text.type !== 'text') {
    throw new Error('Unexpected response type');
  }

  try {
    const jsonMatch = text.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found');
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      description: parsed.description || originalContent.description,
      pros: parsed.pros || originalContent.pros,
      cons: parsed.cons || originalContent.cons,
      faqs: parsed.faqs || originalContent.faqs,
      idealFor: parsed.idealFor || originalContent.idealFor,
      notIdealFor: parsed.notIdealFor || originalContent.notIdealFor,
    };
  } catch {
    log.error('Failed to parse regenerated content');
    return originalContent;
  }
}

// ============================================================================
// Main Verify & Regenerate Loop
// ============================================================================

export async function verifyAndRegenerateLoop(
  content: GeneratedContent,
  sourceData: SourceData,
  anthropic: Anthropic,
  maxAttempts = 3
): Promise<{
  finalContent: GeneratedContent;
  verification: VerificationResult;
  attempts: number;
  improved: boolean;
}> {
  
  let currentContent = content;
  let verification: VerificationResult;
  let attempts = 0;

  while (attempts < maxAttempts) {
    attempts++;
    
    // Verify current content
    verification = await verifyContent(currentContent, sourceData, anthropic);

    if (verification.passed) {
      log.info(`[Verifier] Content passed verification on attempt ${attempts}`);
      return {
        finalContent: currentContent,
        verification,
        attempts,
        improved: attempts > 1,
      };
    }

    if (attempts >= maxAttempts) {
      log.info(`[Verifier] Max attempts reached, returning best effort`);
      break;
    }

    // Regenerate with feedback
    currentContent = await regenerateWithFeedback({
      originalContent: currentContent,
      verification,
      sourceData,
      attempt: attempts + 1,
      maxAttempts,
    }, anthropic);
  }

  // Return last attempt even if not perfect
  return {
    finalContent: currentContent,
    verification: verification!,
    attempts,
    improved: attempts > 1,
  };
}
