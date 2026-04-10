/**
 * TAYA POLICE - Content Validation Module
 * 
 * Validates generated content against TAYA philosophy rules:
 * - Scans for banned marketing phrases
 * - Triggers correction calls to Gemini when violations found
 * - Ensures content is clean before saving to Shopify
 */

import { generateTextSafe } from '@/lib/shopify/ai-client';
import { BANNED_PHRASES, runTriadTest, type TriadTestResult } from '@/lib/core-philosophy';

export { BANNED_PHRASES };

// =============================================================================
// TYPES
// =============================================================================

export interface ValidationResult {
  isValid: boolean;
  violations: Violation[];
  cleanedContent?: CleanedContent;
}

export interface Violation {
  phrase: string;
  context: string;
  field: 'description' | 'pros' | 'cons' | 'faqs';
  suggestion?: string;
}

export interface CleanedContent {
  description: string;
  pros: string[];
  cons: string[];
  faqs: Array<{ question: string; answer: string }>;
  expertOpinion?: string;
}

export interface ContentToValidate {
  description: string;
  pros: string[];
  cons: string[];
  faqs: Array<{ question: string; answer: string }>;
  expertOpinion?: string;
  /** R19: Optional verified facts from TwoPhaseQA for number cross-check.
   *  Format: [{ question: "Qual è la coppia?", answer: "135 Nm" }, ...] */
  verifiedFacts?: Array<{ question: string; answer: string }>;
}

// =============================================================================
// D20 fix: Correction Feedback Loop
// =============================================================================

/**
 * D20 fix: Accumulates violation patterns across runs so the generation prompt
 * can learn from repeated mistakes.
 *
 * When TAYA Police corrects content, it records which phrases were flagged.
 * After N products, the top recurring violations are exported as a "negative
 * examples" section that can be injected into the V3 generation prompt.
 *
 * In-process singleton — resets on cold start (serverless). For cross-request
 * persistence, call getViolationFeedback() and store in Redis externally.
 */
export interface ViolationFrequency {
  phrase: string;
  count: number;
  lastSeen: string; // ISO timestamp
  /** Example context from the most recent occurrence */
  exampleContext: string;
  /** W-TP-4: Times the AI correction passed the post-correction recheck */
  correctionSucceeded: number;
  /** W-TP-4: Times the correction still had violations or introduced hallucinations — fell back to simple replacements */
  correctionFailed: number;
}

const violationAccumulator = new Map<string, ViolationFrequency>();

function recordViolations(violations: Violation[]): void {
  const now = new Date().toISOString();
  for (const v of violations) {
    const key = v.phrase.toLowerCase();
    const existing = violationAccumulator.get(key);
    if (existing) {
      existing.count++;
      existing.lastSeen = now;
      existing.exampleContext = v.context;
    } else {
      violationAccumulator.set(key, {
        phrase: v.phrase,
        count: 1,
        lastSeen: now,
        exampleContext: v.context,
        correctionSucceeded: 0, // W-TP-4
        correctionFailed: 0,    // W-TP-4
      });
    }
  }
}

/**
 * W-TP-4: Record whether the AI correction succeeded or fell back to simple replacements.
 * Call this inside correctContent() at every return point so the accumulator tracks
 * whether each violation phrase is easy or hard for the LLM to correct.
 */
function recordCorrectionOutcome(violations: Violation[], succeeded: boolean): void {
  for (const v of violations) {
    const key = v.phrase.toLowerCase();
    const existing = violationAccumulator.get(key);
    if (existing) {
      if (succeeded) existing.correctionSucceeded++;
      else existing.correctionFailed++;
    }
  }
}

/**
 * D20 fix: Returns the top N most frequent violations as a prompt section.
 *
 * Inject this into the V3 generation prompt to teach the model which phrases
 * to avoid proactively, reducing the TAYA Police correction rate over time.
 *
 * @param topN - Max violations to include (default: 5)
 * @returns A prompt section string, or empty string if no data yet
 */
export function getViolationFeedback(topN = 5): string {
  if (violationAccumulator.size === 0) return '';

  const sorted = Array.from(violationAccumulator.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, topN);

  if (sorted.length === 0) return '';

  const lines = sorted.map(v => {
    // W-TP-4: show fallback rate so the prompt knows which phrases are hardest to correct
    const total = v.correctionSucceeded + v.correctionFailed;
    const rateNote = total > 0
      ? ` [${Math.round((v.correctionFailed / total) * 100)}% fallback]`
      : '';
    return `- NON usare "${v.phrase}" (corretto ${v.count}×${rateNote} — es: "${v.exampleContext.substring(0, 60)}")`;
  });

  return `\n## ERRORI RICORRENTI (da correzioni precedenti — D20)
Le seguenti frasi sono state corrette ripetutamente. Evitale fin dall'inizio:
${lines.join('\n')}`;
}

/**
 * D20 fix: Returns raw violation frequency data for external persistence (e.g., Redis).
 */
export function getViolationStats(): ViolationFrequency[] {
  return Array.from(violationAccumulator.values())
    .sort((a, b) => b.count - a.count);
}

/**
 * W-TP-5: Seed the in-memory accumulator from externally persisted stats (e.g., Redis).
 *
 * On Vercel serverless, each cold start resets the in-memory accumulator. Call this
 * at the start of an invocation with data fetched from Redis to restore prior state.
 * Call BEFORE processing any products in the invocation to avoid double-counting.
 *
 * After processing, call getViolationStats() and persist the result back to Redis.
 *
 * @param stats - Previously persisted stats, as returned by getViolationStats()
 */
export function loadViolationStats(stats: ViolationFrequency[]): void {
  for (const s of stats) {
    const key = s.phrase.toLowerCase();
    const existing = violationAccumulator.get(key);
    if (!existing) {
      violationAccumulator.set(key, {
        phrase: s.phrase,
        count: s.count,
        lastSeen: s.lastSeen,
        exampleContext: s.exampleContext,
        correctionSucceeded: s.correctionSucceeded ?? 0, // ?? for backward compat with old serialised data
        correctionFailed: s.correctionFailed ?? 0,
      });
    } else {
      // Sum counts (external records represent prior invocations, not this one)
      existing.count += s.count;
      existing.correctionSucceeded += s.correctionSucceeded ?? 0;
      existing.correctionFailed += s.correctionFailed ?? 0;
      if (s.lastSeen > existing.lastSeen) {
        existing.lastSeen = s.lastSeen;
        existing.exampleContext = s.exampleContext;
      }
    }
  }
}

/**
 * W-TP-5: Clear all in-memory violation stats (useful for testing or forced reset).
 */
export function resetViolationStats(): void {
  violationAccumulator.clear();
}

// =============================================================================
// W21 fix: Dynamic banned phrase patterns
// =============================================================================

/**
 * W21 fix: Regex patterns that catch LLM-generated synonyms and periphrases
 * not covered by the static BANNED_PHRASES list.
 *
 * The static list catches exact phrases like "leader di settore", but the LLM
 * often generates synonyms ("leader nel settore", "leader del mercato",
 * "punto di riferimento del settore") that bypass the exact match.
 *
 * These patterns are designed to have low false-positive rates by requiring
 * multi-word contexts that are almost always marketing fluff.
 */
const DYNAMIC_BANNED_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /leader\s+(?:del|nel|di)\s+(?:settore|mercato|segmento|categoria)/gi, label: 'leader di settore (variante)' },
  { pattern: /punto\s+di\s+riferimento\s+(?:del|nel|per\s+il)\s+\w+/gi, label: 'punto di riferimento (marketing)' },
  { pattern: /(?:la|il)\s+(?:miglior[ei]?|top)\s+(?:scelta|opzione|soluzione)/gi, label: 'miglior scelta (superlativo)' },
  { pattern: /qualità\s+(?:senza\s+(?:pari|compromessi)|ineguagliabile|imbattibile)/gi, label: 'qualità senza pari (marketing)' },
  { pattern: /tecnologia\s+(?:all['']avanguardia|di\s+ultima\s+generazione|cutting[- ]edge)/gi, label: 'tecnologia all\'avanguardia (marketing)' },
  { pattern: /prestazioni?\s+(?:di\s+alto\s+livello|senza\s+precedenti|fuori\s+classe)/gi, label: 'prestazioni superlative (marketing)' },
  { pattern: /(?:il|la|un)\s+(?:must[- ]have|game[- ]changer)/gi, label: 'must-have/game-changer (anglicismo marketing)' },
  { pattern: /(?:garantisce|assicura|offre)\s+(?:il\s+massimo|risultati?\s+(?:ottimali?|perfett[io]))/gi, label: 'garantisce il massimo (vuoto)' },
  { pattern: /soluzione\s+(?:completa|integrata|a\s+360\s*°?|a\s+360\s*gradi)/gi, label: 'soluzione completa/360° (corporate fluff)' },
];

/**
 * W21: Scan text for dynamic banned patterns (regex-based).
 */
function findDynamicBannedPatterns(text: string): { phrase: string; context: string }[] {
  const violations: { phrase: string; context: string }[] = [];

  for (const { pattern, label } of DYNAMIC_BANNED_PATTERNS) {
    // Reset lastIndex for global regex
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const start = Math.max(0, match.index - 30);
      const end = Math.min(text.length, match.index + match[0].length + 30);
      violations.push({
        phrase: label,
        context: `...${text.slice(start, end)}...`,
      });
    }
  }

  return violations;
}

// =============================================================================
// VALIDATION FUNCTIONS
// =============================================================================

/**
 * Scan text for banned phrases (static list + W21 dynamic patterns)
 */
function findBannedPhrases(text: string): { phrase: string; context: string }[] {
  const violations: { phrase: string; context: string }[] = [];
  const textLower = text.toLowerCase();

  // Static banned phrases (exact match)
  for (const phrase of BANNED_PHRASES) {
    const phraseLower = phrase.toLowerCase();
    let index = textLower.indexOf(phraseLower);

    while (index !== -1) {
      // Extract context (50 chars before and after)
      const start = Math.max(0, index - 50);
      const end = Math.min(text.length, index + phrase.length + 50);
      const context = text.substring(start, end);

      violations.push({
        phrase,
        context: `...${context}...`,
      });

      index = textLower.indexOf(phraseLower, index + 1);
    }
  }

  // W21: Dynamic banned patterns (regex-based synonyms and periphrases)
  violations.push(...findDynamicBannedPatterns(text));

  return violations;
}

/**
 * Validate content against TAYA rules
 */
export function validateContent(content: ContentToValidate): ValidationResult {
  const violations: Violation[] = [];
  
  // Check description
  const descViolations = findBannedPhrases(content.description);
  for (const v of descViolations) {
    violations.push({
      ...v,
      field: 'description',
    });
  }
  
  // Check pros
  for (const pro of content.pros) {
    const proViolations = findBannedPhrases(pro);
    for (const v of proViolations) {
      violations.push({
        ...v,
        field: 'pros',
      });
    }
  }
  
  // Check cons
  for (const con of content.cons) {
    const conViolations = findBannedPhrases(con);
    for (const v of conViolations) {
      violations.push({
        ...v,
        field: 'cons',
      });
    }
  }
  
  // Check FAQs
  for (const faq of content.faqs) {
    const qViolations = findBannedPhrases(faq.question);
    const aViolations = findBannedPhrases(faq.answer);
    
    for (const v of [...qViolations, ...aViolations]) {
      violations.push({
        ...v,
        field: 'faqs',
      });
    }
  }
  
  // Check expert opinion if present
  if (content.expertOpinion) {
    const expertViolations = findBannedPhrases(content.expertOpinion);
    for (const v of expertViolations) {
      violations.push({
        ...v,
        field: 'description', // Group with description
      });
    }
  }
  
  return {
    isValid: violations.length === 0,
    violations,
  };
}

// =============================================================================
// W-TP-1: Technical claim diff check
// =============================================================================

/**
 * W-TP-1: Feature tokens that signal concrete product capabilities.
 * If the AI correction introduces any of these where the original had none,
 * it has hallucinated a technical claim — fall back to simple replacements.
 *
 * D17 already guards against numeric hallucinations; this guards against
 * non-numeric feature additions (e.g., "brushless" or "litio" added out of thin air).
 */
const TECHNICAL_FEATURE_TOKENS = [
  'brushless', 'brushed',
  'litio', 'lithium', 'ioni di litio',
  'inverter',
  'bilanciato', 'bilanciatura',
  'antivibrazioni', 'antivibrazione',
  'silenzioso', 'silenziato',
  'ergonomico', 'ergonomica',
  'telescopico', 'telescopica',
  'regolabile', 'variabile',
  'elettronico', 'elettronica',
  'digitale', 'automatico', 'automatica',
  'programmabile',
  'wireless', 'bluetooth',
  'senza fili', 'a batteria',
  'autobloccante', 'autocentrante',
  'bidirezionale',
];

/**
 * W-TP-1: Extract the set of technical feature tokens present in a text (case-insensitive).
 */
function extractTechnicalTokens(text: string): Set<string> {
  const found = new Set<string>();
  const lower = text.toLowerCase();
  for (const token of TECHNICAL_FEATURE_TOKENS) {
    // Word-boundary-aware check (handle multi-word tokens too)
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`(?:^|\\s|[^a-z])${escaped}(?:$|\\s|[^a-z])`, 'i').test(lower)) {
      found.add(token);
    }
  }
  return found;
}

// =============================================================================
// CORRECTION CALL
// =============================================================================

/**
 * Call Gemini to fix content with banned phrases
 */
export async function correctContent(
  content: ContentToValidate,
  violations: Violation[]
): Promise<CleanedContent> {
  // Group violations by phrase
  const uniquePhrases = Array.from(new Set(violations.map(v => v.phrase)));
  
  // W19 fix: Build a verified facts section so the LLM uses real data when replacing
  // banned phrases. Without this, the model might hallucinate numbers during correction.
  let verifiedFactsSection = '';
  if (content.verifiedFacts && content.verifiedFacts.length > 0) {
    verifiedFactsSection = `\nDATI VERIFICATI (usa SOLO questi numeri nelle sostituzioni):
${content.verifiedFacts.map(f => `- ${f.question}: ${f.answer}`).join('\n')}

CRITICO: Quando sostituisci una frase vietata con un dato concreto, usa SOLO i numeri elencati sopra. Se non c'è un dato verificato pertinente, usa una riformulazione qualitativa senza numeri.\n`;
  }

  const prompt = `Sei il correttore di bozze del Team Autonord. Hai trovato parole vietate dalla filosofia TAYA nel contenuto.

PAROLE VIETATE TROVATE:
${uniquePhrases.map(p => `- "${p}"`).join('\n')}
${verifiedFactsSection}
CONTENUTO DA CORREGGERE:

DESCRIZIONE:
${content.description}

PRO:
${content.pros.map((p, i) => `${i + 1}. ${p}`).join('\n')}

CONTRO:
${content.cons.map((c, i) => `${i + 1}. ${c}`).join('\n')}

FAQ:
${content.faqs.map((f, i) => `${i + 1}. D: ${f.question}\n   R: ${f.answer}`).join('\n')}

${content.expertOpinion ? `OPINIONE ESPERTO:\n${content.expertOpinion}` : ''}

---

ISTRUZIONI:
1. Riscrivi SOLO le frasi che contengono le parole vietate
2. Sostituisci il marketing fluff con fatti concreti dai DATI VERIFICATI sopra
3. Mantieni lo stesso significato ma con linguaggio onesto
4. NON aggiungere numeri o specifiche che NON sono nei dati verificati
5. Se non hai un dato concreto per la sostituzione, riformula senza numeri

ESEMPI DI CORREZIONE (solo se il dato è nei DATI VERIFICATI):
- "prestazioni eccezionali" → "135 Nm di coppia, sufficiente per cemento armato"
- "qualità superiore" → "costruzione in metallo, garanzia 5 anni"
- "il migliore" → "tra i più potenti della categoria"
- "leader di settore" → "brand professionale diffuso nei cantieri"

Rispondi in JSON con la struttura corretta:
{
  "description": "descrizione corretta",
  "pros": ["pro 1 corretto", "pro 2 corretto", "pro 3 corretto"],
  "cons": ["contro 1 corretto", "contro 2 corretto"],
  "faqs": [
    {"question": "domanda", "answer": "risposta corretta"}
  ],
  "expertOpinion": "opinione corretta (se presente)"
}`;

  try {
    const result = await generateTextSafe({
      system: 'Sei il correttore di bozze del Team Autonord. Correggi il contenuto rimuovendo le parole vietate dalla filosofia TAYA. Rispondi sempre in formato JSON valido.',
      prompt,
      maxTokens: 2000,
      temperature: 0.4,
    });

    const responseText = result.text;
    
    if (!responseText) {
      throw new Error('Empty response from Gemini');
    }

    // Parse JSON response
    const cleanedText = responseText
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();

    const parsed: unknown = JSON.parse(cleanedText);
    if (
      typeof parsed !== 'object' || parsed === null ||
      typeof (parsed as Record<string, unknown>).description !== 'string' ||
      !Array.isArray((parsed as Record<string, unknown>).pros) ||
      !Array.isArray((parsed as Record<string, unknown>).cons) ||
      !Array.isArray((parsed as Record<string, unknown>).faqs)
    ) {
      throw new Error('JSON response missing required CleanedContent fields');
    }
    const cleaned = parsed as CleanedContent;

    // Validate the cleaned content doesn't have violations
    const recheck = validateContent(cleaned);

    if (!recheck.isValid) {
      console.warn('[TAYA Police] Correction still has violations, using original with manual fixes');
      recordCorrectionOutcome(violations, false); // W-TP-4
      return applySimpleReplacements(content, uniquePhrases);
    }

    // D17 fix: Re-verify numbers in the corrected content.
    // The LLM may hallucinate new numbers during correction (e.g., replacing
    // "prestazioni eccezionali" with "coppia di 200 Nm" when the real spec is 135 Nm).
    if (content.verifiedFacts && content.verifiedFacts.length > 0) {
      const correctedAsValidatable: ContentToValidate = {
        ...cleaned,
        verifiedFacts: content.verifiedFacts,
      };
      const newUnverifiedNumbers = crossCheckNumbers(correctedAsValidatable);
      if (newUnverifiedNumbers.length > 0) {
        console.warn(
          `[TAYA Police] D17: Correction introduced ${newUnverifiedNumbers.length} unverified number(s): ` +
          `${newUnverifiedNumbers.join(', ')} — falling back to simple replacements`
        );
        recordCorrectionOutcome(violations, false); // W-TP-4
        return applySimpleReplacements(content, uniquePhrases);
      }
    }

    // W-TP-1: Check for new non-numeric technical claims introduced by the AI correction.
    // D17 guards against numeric hallucinations; this guards against feature-level additions
    // (e.g., "brushless" or "litio" added where the original mentioned neither).
    const originalText = [
      content.description,
      ...content.pros,
      ...content.cons,
      ...content.faqs.flatMap(f => [f.question, f.answer]),
    ].join(' ');
    const correctedText = [
      cleaned.description,
      ...cleaned.pros,
      ...cleaned.cons,
      ...cleaned.faqs.flatMap(f => [f.question, f.answer]),
    ].join(' ');
    const originalClaims = extractTechnicalTokens(originalText);
    const correctedClaims = extractTechnicalTokens(correctedText);
    const newClaims = Array.from(correctedClaims).filter(c => !originalClaims.has(c));
    if (newClaims.length > 0) {
      console.warn(
        `[TAYA Police] W-TP-1: Correction added ${newClaims.length} new technical claim(s): ` +
        `${newClaims.join(', ')} — falling back to simple replacements`
      );
      recordCorrectionOutcome(violations, false); // W-TP-4
      return applySimpleReplacements(content, uniquePhrases);
    }

    recordCorrectionOutcome(violations, true); // W-TP-4: AI correction passed all checks
    return cleaned;

  } catch (error) {
    console.error('[TAYA Police] Correction error:', error);
    recordCorrectionOutcome(violations, false); // W-TP-4
    return applySimpleReplacements(content, uniquePhrases);
  }
}

/**
 * Simple replacement fallback
 */
function applySimpleReplacements(
  content: ContentToValidate,
  phrases: string[]
): CleanedContent {
  // W-TP-2: Audited dictionary — removed borderline replacements (e.g. "qualità professionale"
  // was itself borderline marketing). Added coverage for all W21 dynamic pattern labels.
  const replacements: Record<string, string> = {
    // Leader / brand positioning
    'leader di settore': 'brand professionale',
    'leader del settore': 'brand professionale',
    'leader nel settore': 'brand professionale',           // W-TP-2: W21 variant
    'leader del mercato': 'brand diffuso nei cantieri',    // W-TP-2: W21 variant
    // Excellence / quality superlatives
    'eccellenza': 'qualità',                               // W-TP-2: was "qualità professionale" (borderline)
    'qualità superiore': 'costruzione robusta',
    'alta qualità': 'costruzione solida',
    'massima qualità': 'costruzione solida',               // W-TP-2: was "costruzione professionale" (borderline)
    'qualità eccezionale': 'buona costruzione',
    'qualità senza pari': 'buona qualità',                 // W-TP-2: W21 dynamic pattern
    'qualità ineguagliabile': 'buona qualità',             // W-TP-2: W21 dynamic pattern
    'qualità imbattibile': 'buona qualità',                // W-TP-2: W21 dynamic pattern
    // Best / superlative comparisons
    'il migliore': 'tra i più performanti',
    'i migliori': 'tra i più performanti',
    'la miglior scelta': 'una scelta valida',              // W-TP-2: W21 dynamic pattern
    'la migliore scelta': 'una scelta valida',             // W-TP-2: W21 dynamic pattern
    'la migliore opzione': 'una scelta valida',            // W-TP-2: W21 dynamic pattern
    'la migliore soluzione': 'una soluzione valida',       // W-TP-2: W21 dynamic pattern
    'impareggiabile': 'di buon livello',                   // W-TP-2: was "di alto livello" (borderline)
    'insuperabile': 'tra i più performanti della categoria',
    'imbattibile': 'competitivo',
    'senza pari': 'competitivo',
    // Qualitative adjectives
    'straordinario': 'notevole',
    'eccezionale': 'solido',
    'prestazioni eccezionali': 'prestazioni solide',
    'prestazioni senza precedenti': 'buone prestazioni',   // W-TP-2: W21 dynamic pattern
    'prestazioni di alto livello': 'buone prestazioni',    // W-TP-2: W21 dynamic pattern
    'all\'avanguardia': 'aggiornato',                      // W-TP-2: was "moderno" (vague)
    'tecnologia all\'avanguardia': 'tecnologia attuale',   // W-TP-2: W21 dynamic pattern
    'tecnologia di ultima generazione': 'tecnologia recente', // W-TP-2: W21 dynamic pattern
    'innovativo': 'con tecnologia recente',
    'rivoluzionario': 'innovativo nella categoria',
    'perfetto': 'adatto',
    'fantastico': 'valido',
    'incredibile': 'notevole',
    // Reference / positioning
    'punto di riferimento del settore': 'marchio consolidato nel settore', // W-TP-2: W21 dynamic pattern
    'punto di riferimento nel settore': 'marchio consolidato nel settore', // W-TP-2: W21 dynamic pattern
    'soluzione completa': 'soluzione adeguata',            // W-TP-2: W21 dynamic pattern
    'soluzione integrata': 'soluzione adeguata',           // W-TP-2: W21 dynamic pattern
    'soluzione a 360°': 'soluzione versatile',             // W-TP-2: W21 dynamic pattern
    'soluzione a 360 gradi': 'soluzione versatile',        // W-TP-2: W21 dynamic pattern
    'garantisce il massimo': 'offre buone prestazioni',    // W-TP-2: W21 dynamic pattern
    'must-have': 'utensile utile',                         // W-TP-2: W21 anglicism
    'game-changer': 'soluzione concreta',                  // W-TP-2: W21 anglicism
    // Object references
    'unico nel suo genere': 'distintivo',
    'questo prodotto': 'questo utensile',
    'questo articolo': 'questo utensile',
    // Misc
    'risultati straordinari': 'risultati concreti',
    'esperienza unica': 'esperienza positiva',
    'servizio impeccabile': 'servizio affidabile',
  };
  
  let description = content.description;
  let expertOpinion = content.expertOpinion || '';
  const pros = [...content.pros];
  const cons = [...content.cons];
  const faqs = content.faqs.map(f => ({ ...f }));
  
  // Apply replacements
  for (const phrase of phrases) {
    const replacement = replacements[phrase.toLowerCase()] || 'professionale';
    const regex = new RegExp(phrase, 'gi');
    
    description = description.replace(regex, replacement);
    expertOpinion = expertOpinion.replace(regex, replacement);
    
    for (let i = 0; i < pros.length; i++) {
      pros[i] = pros[i].replace(regex, replacement);
    }
    
    for (let i = 0; i < cons.length; i++) {
      cons[i] = cons[i].replace(regex, replacement);
    }
    
    for (const faq of faqs) {
      faq.question = faq.question.replace(regex, replacement);
      faq.answer = faq.answer.replace(regex, replacement);
    }
  }
  
  return {
    description,
    pros,
    cons,
    faqs,
    expertOpinion: expertOpinion || undefined,
  };
}

// =============================================================================
// R18: SEMANTIC MARKETING DENSITY CHECK
// =============================================================================

/**
 * R18: Detect paragraphs with high qualitative adjective density and no concrete numbers.
 * Returns a list of suspicious paragraph summaries (logged as warnings, not blocking).
 *
 * A paragraph is "marketing-dense" when it has 5+ qualitative adjectives and 0 numbers.
 * These are usually hollow claims like "potente, robusto e affidabile per ogni cantiere".
 */
function detectMarketingDensity(text: string): string[] {
  // Italian qualitative adjectives that signal marketing fluff
  const QUALITATIVE_ADJECTIVES = [
    'potente', 'potenti', 'robusto', 'robusti', 'robusta', 'robuste',
    'affidabile', 'affidabili', 'professionale', 'professionali',
    'eccellente', 'eccellenti', 'ottimo', 'ottimi', 'ottima', 'ottime',
    'avanzato', 'avanzati', 'avanzata', 'avanzate',
    'innovativo', 'innovativi', 'innovativa', 'innovative',
    'superiore', 'superiori', 'elevato', 'elevati', 'elevata', 'elevate',
    'esclusivo', 'esclusivi', 'esclusiva', 'esclusive',
    'efficiente', 'efficienti', 'performante', 'performanti',
    'solido', 'solidi', 'solida', 'solide', 'durevole', 'durevoli',
    'versatile', 'versatili', 'pratico', 'pratici', 'pratica', 'pratiche',
  ];

  const warnings: string[] = [];
  const paragraphs = text.split(/\n{2,}|\.\s+(?=[A-ZÜÀÈÉÌÍÒÓÙÚ])/);

  for (const para of paragraphs) {
    const words = para.toLowerCase().split(/\s+/);
    if (words.length < 15) continue; // Skip very short paragraphs

    const adjCount = words.filter(w =>
      QUALITATIVE_ADJECTIVES.includes(w.replace(/[^a-zàèéìíòóùú]/g, ''))
    ).length;

    const hasNumbers = /\d/.test(para);

    // W-TP-3: Use relative density instead of absolute count.
    // A 20-word paragraph with 5 qualitative adjectives (25% density) is very different
    // from a 100-word paragraph with 5 adjectives (5% density — likely fine).
    // Threshold: ≥15% adj density OR ≥8 absolute adjectives, with no concrete numbers.
    const adjDensity = adjCount / words.length;
    if ((adjDensity >= 0.15 || adjCount >= 8) && !hasNumbers) {
      const preview = para.slice(0, 80).replace(/\s+/g, ' ');
      warnings.push(
        `marketing-dense paragraph (${adjCount}/${words.length} words = ${Math.round(adjDensity * 100)}% qualitative adj, 0 numbers): "${preview}..."`
      );
    }
  }

  return warnings;
}

/**
 * W18 fix: Numbers that are inherently safe to skip — list indices, years, generic counts.
 * These appear naturally in generated text and are not technical spec claims.
 */
const SAFE_NUMBER_PATTERNS = [
  /^\d{4}$/,       // years (2024, 2026)
  /^20[12]\d$/,    // years 2010-2029
];

/**
 * W18 fix: Check if a number in context is a technical claim (weight, capacity, etc.)
 * vs. a structural/decorative number (list index, year, "2 anni garanzia").
 */
function isTechnicalContext(text: string, numStr: string): boolean {
  const idx = text.indexOf(numStr);
  if (idx === -1) return false;
  // Look at ±30 chars around the number
  const start = Math.max(0, idx - 30);
  const end = Math.min(text.length, idx + numStr.length + 30);
  const context = text.slice(start, end).toLowerCase();
  // Technical unit indicators
  return /\b(kg|nm|v|w|kw|kva|ah|rpm|bpm|bar|l|mm|cm|cc|db|hz|m\/s|l\/min|l\/h|m³\/h|hp|pollici?)\b/i.test(context);
}

/**
 * R19 + W18 fix: Cross-check numbers in generated content against TwoPhaseQA verified facts.
 *
 * W18 improvements over the original:
 * - No longer blindly skips all numbers <10 (catches weight 2.1kg, capacity 5Ah, etc.)
 * - Instead, uses context analysis: only flags numbers near technical units
 * - Handles fractional formats: "1/4", "1/2" (common in chuck sizes)
 * - Handles model identifiers: extracts numbers from "M18", "M12"
 */
function crossCheckNumbers(content: ContentToValidate): string[] {
  if (!content.verifiedFacts || content.verifiedFacts.length === 0) return [];

  // Extract all numbers from verified fact answers (including fractions)
  const verifiedNumbers = new Set<number>();
  const verifiedStrings = new Set<string>(); // exact string matches for "1/4", "M18" etc.

  for (const fact of content.verifiedFacts) {
    // Standard numeric extraction
    const matches = fact.answer.match(/\d+(?:[.,]\d+)?/g) ?? [];
    for (const m of matches) {
      verifiedNumbers.add(parseFloat(m.replace(',', '.')));
      verifiedStrings.add(m);
    }
    // W18: Extract fractions like "1/4", "1/2", "3/8"
    const fractions = fact.answer.match(/\d+\/\d+/g) ?? [];
    for (const f of fractions) {
      verifiedStrings.add(f);
      const [num, den] = f.split('/').map(Number);
      if (den !== 0) verifiedNumbers.add(num / den);
    }
  }

  if (verifiedNumbers.size === 0 && verifiedStrings.size === 0) return [];

  // Extract numbers from generated content
  const contentText = [
    content.description,
    ...content.pros,
    ...content.cons,
    ...content.faqs.flatMap(f => [f.question, f.answer]),
  ].join(' ');

  const contentNumbers = contentText.match(/\d+(?:[.,]\d+)?/g) ?? [];
  // W18: Also extract fractions from content
  const contentFractions = contentText.match(/\d+\/\d+/g) ?? [];

  const unverified: string[] = [];

  for (const numStr of contentNumbers) {
    const num = parseFloat(numStr.replace(',', '.'));

    // Skip if it's a safe pattern (year, etc.)
    if (SAFE_NUMBER_PATTERNS.some(p => p.test(numStr))) continue;

    // W18: For small numbers (<10), only flag if they appear in technical context
    if (num < 10 && !isTechnicalContext(contentText, numStr)) continue;

    // Skip exact string matches
    if (verifiedStrings.has(numStr)) continue;

    // Check with ±5% tolerance
    const isVerified = Array.from(verifiedNumbers).some(vn => {
      if (vn === 0) return false;
      return Math.abs(num - vn) / Math.max(Math.abs(vn), 1) <= 0.05;
    });

    if (!isVerified && !unverified.includes(numStr)) {
      unverified.push(numStr);
    }
  }

  // W18: Check fractions separately
  for (const frac of contentFractions) {
    if (!verifiedStrings.has(frac) && !unverified.includes(frac)) {
      unverified.push(frac);
    }
  }

  return unverified;
}

/**
 * R20: Targeted correction for triad test issues (structural problems, not banned phrases).
 * Called when content passes phrase validation but fails KRUG/JTBD/TAYA structural checks.
 */
async function correctContentForTriad(
  content: ContentToValidate,
  issues: string[]
): Promise<CleanedContent> {
  const prompt = `Sei il correttore di bozze del Team Autonord. Il contenuto non ha parole vietate,
ma ha problemi strutturali identificati dal Triad Test (TAYA + KRUG + JTBD).

PROBLEMI STRUTTURALI RILEVATI:
${issues.map(i => `- ${i}`).join('\n')}

CONTENUTO DA MIGLIORARE:

DESCRIZIONE:
${content.description}

PRO:
${content.pros.map((p, i) => `${i + 1}. ${p}`).join('\n')}

CONTRO:
${content.cons.map((c, i) => `${i + 1}. ${c}`).join('\n')}

FAQ:
${content.faqs.map((f, i) => `${i + 1}. D: ${f.question}\n   R: ${f.answer}`).join('\n')}

ISTRUZIONI:
1. Correggi SOLO i problemi strutturali elencati sopra
2. Non cambiare i dati tecnici verificati
3. Accorcia le frasi lunghe (max 20 parole)
4. Aggiungi inquadramento mestiere dove manca (idraulici, elettricisti, carpentieri)
5. Mantieni la struttura JSON originale

Rispondi in JSON:
{
  "description": "descrizione migliorata",
  "pros": ["pro 1", "pro 2", "pro 3"],
  "cons": ["contro 1", "contro 2"],
  "faqs": [{"question": "...", "answer": "..."}]
}`;

  const result = await generateTextSafe({
    system: 'Sei il correttore strutturale del Team Autonord. Migliora la leggibilità e il framing JTBD senza alterare i dati tecnici. Rispondi sempre in JSON valido.',
    prompt,
    maxTokens: 2000,
    temperature: 0.3,
  });

  const cleaned = result.text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  const jsonStart = cleaned.indexOf('{');
  const jsonEnd = cleaned.lastIndexOf('}');
  if (jsonStart === -1 || jsonEnd === -1) throw new Error('No JSON in triad correction response');

  const parsed = JSON.parse(cleaned.slice(jsonStart, jsonEnd + 1)) as CleanedContent;
  return {
    description: parsed.description || content.description,
    pros: Array.isArray(parsed.pros) ? parsed.pros : content.pros,
    cons: Array.isArray(parsed.cons) ? parsed.cons : content.cons,
    faqs: Array.isArray(parsed.faqs) ? parsed.faqs : content.faqs,
    expertOpinion: content.expertOpinion,
  };
}

// =============================================================================
// MAIN VALIDATION PIPELINE
// =============================================================================

/**
 * Full validation pipeline: validate and correct if needed.
 * Runs a fast Triad Test (TAYA + KRUG + JTBD) before the expensive AI call.
 */
export async function validateAndCorrect(
  content: ContentToValidate
): Promise<{ content: CleanedContent; wasFixed: boolean; violations: Violation[]; triadScore?: TriadTestResult }> {
  console.log('[TAYA Police] 🚔 Scanning content for violations...');

  // Fast Triad Test (no AI call) — join all fields into a single string
  const fullText = [
    content.description,
    ...content.pros,
    ...content.cons,
    ...content.faqs.flatMap(f => [f.question, f.answer]),
    content.expertOpinion || '',
  ].filter(Boolean).join('\n');

  // Deterministic structure pre-check (merged from quality-control.ts — R4)
  const textOnly = fullText.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  const wordCount = textOnly.split(' ').filter(Boolean).length;
  if (wordCount < 150) {
    console.warn(`[TAYA Police] ⚠️ Content too short: ${wordCount} words (min 150)`);
  }
  const h2Count = (content.description.match(/<h2/gi) || []).length;
  if (h2Count < 2) {
    console.warn(`[TAYA Police] ⚠️ Description has only ${h2Count} H2 section(s) (recommended: 2+)`);
  }
  if (content.pros.length < 3) {
    console.warn(`[TAYA Police] ⚠️ Only ${content.pros.length} pros (recommended: 3+)`);
  }
  if (content.cons.length < 2) {
    console.warn(`[TAYA Police] ⚠️ Only ${content.cons.length} cons (recommended: 2+) — may seem promotional`);
  }

  const triadScore = runTriadTest(fullText);
  console.log(
    `[TAYA Police] Triad scores — TAYA: ${triadScore.taya.score} KRUG: ${triadScore.krug.score} JTBD: ${triadScore.jtbd.score} → ${triadScore.overall.action}`
  );
  if (triadScore.krug.issues.length > 0) {
    console.warn('[TAYA Police] KRUG issues:', triadScore.krug.issues);
  }
  if (triadScore.jtbd.issues.length > 0) {
    console.warn('[TAYA Police] JTBD issues:', triadScore.jtbd.issues);
  }

  // W20 fix: Marketing density check — now creates blocking violations (not just warnings).
  // A paragraph with 5+ qualitative adjectives and 0 numbers is marketing fluff and should
  // be corrected before going to production.
  const marketingWarnings = detectMarketingDensity(fullText);
  const marketingViolations: Violation[] = [];
  if (marketingWarnings.length > 0) {
    console.warn(`[TAYA Police] W20 Marketing density: ${marketingWarnings.length} blocking violation(s):`);
    for (const w of marketingWarnings) {
      console.warn(`  - ${w}`);
      marketingViolations.push({
        phrase: 'marketing-dense paragraph',
        context: w,
        field: 'description',
        suggestion: 'Replace qualitative adjectives with concrete numbers or remove the paragraph',
      });
    }
  }

  // R19: Verified fact cross-check — flag numbers not in QA-verified data
  const unverifiedNumbers = crossCheckNumbers(content);
  if (unverifiedNumbers.length > 0) {
    console.warn(
      `[TAYA Police] R19 Fact cross-check: ${unverifiedNumbers.length} number(s) not in QA-verified data: ${unverifiedNumbers.join(', ')} — check for hallucination`
    );
  }

  // Phrase-level validation (TAYA banned words)
  const validation = validateContent(content);

  // W20: Merge marketing density violations into the validation result
  if (marketingViolations.length > 0) {
    validation.violations.push(...marketingViolations);
    validation.isValid = false;
  }

  // R20: Triad Test actionable — if content is clean on banned phrases BUT the triad
  // says "rewrite", trigger a focused correction call with the specific structural issues.
  if (validation.isValid) {
    if (triadScore.overall.action === 'REVISIONE_MAGGIORE' || triadScore.overall.action === 'RIFIUTA') {
      const triadIssues = [
        ...triadScore.krug.issues,
        ...triadScore.jtbd.issues,
        ...triadScore.taya.issues,
      ];
      if (triadIssues.length > 0) {
        console.warn(`[TAYA Police] R20 Triad action=rewrite with ${triadIssues.length} structural issues — triggering targeted correction`);
        try {
          const triadCorrected = await correctContentForTriad(content, triadIssues);

          // W22 fix: Regression check — verify the correction didn't introduce new problems.
          // Re-run banned phrase scan + structure checks on the corrected content.
          const regressionCheck = validateContent(triadCorrected);
          const correctedText = [
            triadCorrected.description,
            ...triadCorrected.pros,
            ...triadCorrected.cons,
            ...triadCorrected.faqs.flatMap(f => [f.question, f.answer]),
          ].join(' ').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
          const correctedWordCount = correctedText.split(' ').filter(Boolean).length;

          if (!regressionCheck.isValid) {
            console.warn(
              `[TAYA Police] W22: Triad correction introduced ${regressionCheck.violations.length} new violation(s) — ` +
              `falling back to original content`
            );
            // Don't use the corrected version — it's worse
          } else if (correctedWordCount < wordCount * 0.5) {
            console.warn(
              `[TAYA Police] W22: Triad correction lost too much content ` +
              `(${correctedWordCount} words vs original ${wordCount}) — falling back to original`
            );
          } else {
            // D17 fix: Re-verify numbers in triad-corrected content
            if (content.verifiedFacts && content.verifiedFacts.length > 0) {
              const correctedAsValidatable: ContentToValidate = {
                ...triadCorrected,
                verifiedFacts: content.verifiedFacts,
              };
              const newNums = crossCheckNumbers(correctedAsValidatable);
              if (newNums.length > 0) {
                console.warn(
                  `[TAYA Police] D17: Triad correction introduced ${newNums.length} unverified number(s): ` +
                  `${newNums.join(', ')} — falling back to original`
                );
                // Fall through to original content below
              }
            }

            // W22: Also re-run triad test to confirm improvement
            const correctedTriad = runTriadTest(correctedText);
            if (correctedTriad.overall.totalScore < triadScore.overall.totalScore) {
              console.warn(
                `[TAYA Police] W22: Triad correction made score worse ` +
                `(${correctedTriad.overall.totalScore} < ${triadScore.overall.totalScore}) — falling back to original`
              );
            } else {
              console.log(
                `[TAYA Police] W22: Triad correction passed regression check ` +
                `(score: ${triadScore.overall.totalScore} → ${correctedTriad.overall.totalScore}, words: ${correctedWordCount})`
              );
              return {
                content: triadCorrected,
                wasFixed: true,
                violations: [],
                triadScore: correctedTriad,
              };
            }
          }
        } catch (err) {
          console.warn('[TAYA Police] R20 Triad correction failed, returning original:', err);
        }
      }
    }
    console.log('[TAYA Police] ✅ Content is clean');
    return {
      content: {
        description: content.description,
        pros: content.pros,
        cons: content.cons,
        faqs: content.faqs,
        expertOpinion: content.expertOpinion,
      },
      wasFixed: false,
      violations: [],
      triadScore,
    };
  }

  console.log(`[TAYA Police] ⚠️ Found ${validation.violations.length} violations`);
  for (const v of validation.violations) {
    console.log(`  - "${v.phrase}" in ${v.field}`);
  }

  // D20 fix: Record violations for feedback loop
  recordViolations(validation.violations);

  console.log('[TAYA Police] 🔧 Calling Gemini for correction...');
  const corrected = await correctContent(content, validation.violations);

  console.log('[TAYA Police] ✅ Content corrected');

  return {
    content: corrected,
    wasFixed: true,
    violations: validation.violations,
    triadScore,
  };
}

// =============================================================================
// EXPORTS
// =============================================================================

export { findBannedPhrases };
