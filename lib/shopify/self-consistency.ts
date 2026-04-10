/**
 * Self-Consistency Check — post-generation numeric coherence validation.
 *
 * Extracts every number+unit pair from description, pros, cons, and FAQ
 * answers, then checks for two classes of conflict:
 *
 *   1. Cross-section conflict:  Same unit appears in two or more sections
 *      with values that differ by more than CONFLICT_THRESHOLD (2%).
 *      Example: description says "135 Nm", FAQ answer says "150 Nm".
 *
 *   2. QA-fact conflict:  A verified AtomicFact has a numeric answer for
 *      a unit that also appears in the generated content with a different
 *      value.  Example: QA fact "135 Nm" but V3 generated "200 Nm".
 *
 * Design decisions:
 *  - Pure function — no AI calls, no I/O, runs in < 5 ms.
 *  - Uses the same UNIT_PATTERN regex as checkOutputConsistency() in
 *    ai-enrichment-v3.ts so coverage is identical (Nm, kg, W, kW, V, Ah,
 *    rpm, bar, dB, mm, cm, L, litri, °C, Hz, kVA, kN, cc).
 *  - Conflict threshold 2% — same as the existing internal check — to
 *    tolerate legitimate rounding differences (e.g. 2.0 kg vs 2,0 kg).
 *  - Non-blocking: callers must decide what to do with the report.
 *    The worker route increments dataQuality.conflictsFound and logs.
 *
 * Usage (route.ts, after generateProductContentV3):
 *   import { selfConsistencyCheck } from '@/lib/shopify/self-consistency';
 *   const report = selfConsistencyCheck(enrichedData, qaFacts);
 *   enrichedData.dataQuality.conflictsFound += report.conflicts.length + report.qaConflicts.length;
 *   for (const c of [...report.conflicts, ...report.qaConflicts])
 *     enrichedData.dataQuality.manualCheckRequired.push(c.description);
 */

import type { EnrichedProductData, FAQ } from './webhook-types';
import type { AtomicFact } from './two-phase-qa';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Relative difference above which two values for the same unit are flagged.
 * 2 % tolerates legitimate rounding (e.g. 135 vs 134.9).
 */
const CONFLICT_THRESHOLD = 0.02;

/**
 * Number of characters captured on each side of a match for the context
 * field — used only for human-readable conflict messages.
 */
const CONTEXT_WINDOW = 45;

/**
 * Unit pattern — mirrors the one in checkOutputConsistency() so that
 * coverage is identical and the two checks are complementary.
 * Lowercase/uppercase variants are handled by the alternation in the regex.
 */
const UNIT_PATTERN =
  /(\d+(?:[.,]\d+)?)\s*(Nm|kg|[kK][wW]|[wW](?!\w)|[vV](?!\w)|Ah|[rR][pP][mM]|bar|dB(?:\(A\))?|mm|cm|[lL](?:\b|itri?)|°C|Hz|kVA|kN|cc)/g;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SectionName = 'description' | 'pros' | 'cons' | 'faqs';

export interface NumericMention {
  /** Normalized numeric value (comma → dot). */
  value: number;
  /** Lowercase normalized unit string (e.g. "nm", "kg", "w"). */
  unit: string;
  /** Original text fragment (e.g. "135 Nm"). */
  raw: string;
  section: SectionName;
  /** Up to 2 × CONTEXT_WINDOW chars surrounding the match. */
  context: string;
}

export interface ConsistencyConflict {
  unit: string;
  mentionA: NumericMention;
  mentionB: NumericMention;
  /** Human-readable one-liner for logs / dataQuality.manualCheckRequired. */
  description: string;
}

export interface QAConflict {
  /** The verified atomic fact that contradicts generated content. */
  qaFact: Pick<AtomicFact, 'question' | 'answer' | 'confidence'>;
  /** The mention in V3 content that differs from the QA fact. */
  mention: NumericMention;
  /** Human-readable description. */
  description: string;
}

export interface ConsistencyReport {
  /** Internal cross-section numeric conflicts (description ↔ pros ↔ cons ↔ faqs). */
  conflicts: ConsistencyConflict[];
  /** Conflicts between generated content and verified QA atomic facts. */
  qaConflicts: QAConflict[];
  /** Total number+unit pairs extracted across all sections. */
  totalNumbersFound: number;
  /** True when both conflict arrays are empty. */
  isClean: boolean;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Run the self-consistency check on V3-generated content against QA facts.
 *
 * @param content   V3 output: description, pros, cons, faqs.
 * @param qaFacts   AtomicFact[] from TwoPhaseQA simpleQA.rawFacts.
 *                  Pass [] when qaResult is null (pipeline still runs safely).
 */
export function selfConsistencyCheck(
  content: EnrichedProductData,
  qaFacts: AtomicFact[],
): ConsistencyReport {
  // 1. Collect all numeric mentions across the four sections
  const allMentions: NumericMention[] = [
    ...extractMentions(content.description ?? '', 'description'),
    ...extractMentions((content.pros ?? []).join(' | '), 'pros'),
    ...extractMentions((content.cons ?? []).join(' | '), 'cons'),
    ...extractFaqMentions(content.faqs ?? []),
  ];

  // 2. Cross-section conflicts
  const conflicts = findCrossSectionConflicts(allMentions);

  // 3. QA-fact conflicts (only verified facts that are not NON TROVATO).
  // Do NOT use UNIT_PATTERN.test() here — it's a stateful /g regex and
  // calling .test() repeatedly in .filter() advances lastIndex across iterations,
  // causing every second call to start from the wrong offset.
  // extractMentions() handles the filtering naturally (returns [] for non-numeric answers).
  const verifiedFacts = qaFacts.filter(
    f => f.verified && f.answer !== 'NON TROVATO',
  );

  const qaConflicts = findQAConflicts(allMentions, verifiedFacts);

  return {
    conflicts,
    qaConflicts,
    totalNumbersFound: allMentions.length,
    isClean: conflicts.length === 0 && qaConflicts.length === 0,
  };
}

// ---------------------------------------------------------------------------
// Extraction helpers
// ---------------------------------------------------------------------------

function extractMentions(text: string, section: SectionName): NumericMention[] {
  const mentions: NumericMention[] = [];
  const re = new RegExp(UNIT_PATTERN.source, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const raw = m[0];
    const value = parseFloat(m[1].replace(',', '.'));
    const unit = normalizeUnit(m[2]);
    const start = Math.max(0, m.index - CONTEXT_WINDOW);
    const end   = Math.min(text.length, m.index + raw.length + CONTEXT_WINDOW);
    const context = text.slice(start, end).replace(/\s+/g, ' ').trim();
    mentions.push({ value, unit, raw, section, context });
  }
  return mentions;
}

function extractFaqMentions(faqs: FAQ[]): NumericMention[] {
  return faqs.flatMap(faq => [
    ...extractMentions(faq.question ?? '', 'faqs'),
    ...extractMentions(faq.answer   ?? '', 'faqs'),
  ]);
}

/** Collapse unit spelling variants to a canonical lowercase key. */
function normalizeUnit(raw: string): string {
  const u = raw.toLowerCase().replace(/\(a\)/, ''); // dB(A) → db
  if (u === 'litri' || u === 'litro' || u === 'lt') return 'l';
  if (u === 'rpm' || u === 'rpm') return 'rpm';
  if (u === 'kw') return 'kw';
  return u;
}

// ---------------------------------------------------------------------------
// Conflict detection
// ---------------------------------------------------------------------------

/**
 * For each normalized unit, collect all distinct values seen across sections.
 * Pairs where relative difference > CONFLICT_THRESHOLD are flagged.
 */
function findCrossSectionConflicts(mentions: NumericMention[]): ConsistencyConflict[] {
  // Group by unit
  const byUnit = new Map<string, NumericMention[]>();
  for (const m of mentions) {
    if (!byUnit.has(m.unit)) byUnit.set(m.unit, []);
    byUnit.get(m.unit)!.push(m);
  }

  const conflicts: ConsistencyConflict[] = [];

  for (const [unit, group] of byUnit) {
    // Compare every pair (i, j) where i < j
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i];
        const b = group[j];
        if (valuesConflict(a.value, b.value)) {
          conflicts.push({
            unit,
            mentionA: a,
            mentionB: b,
            description:
              `${a.raw} in ${a.section} ↔ ${b.raw} in ${b.section} (${unit})`,
          });
        }
      }
    }
  }

  // Deduplicate: keep only the highest-severity pair per unit
  // (avoid N² output when 3+ conflicting values exist for the same unit)
  const seen = new Set<string>();
  return conflicts.filter(c => {
    const key = `${c.unit}:${Math.min(c.mentionA.value, c.mentionB.value)}:${Math.max(c.mentionA.value, c.mentionB.value)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * For each verified QA fact, extract its numeric value and compare against
 * every mention of the same unit in the generated content.
 */
function findQAConflicts(
  mentions: NumericMention[],
  verifiedFacts: AtomicFact[],
): QAConflict[] {
  const qaConflicts: QAConflict[] = [];

  for (const fact of verifiedFacts) {
    const factMentions = extractMentions(fact.answer, 'description'); // section label unused here
    for (const fm of factMentions) {
      // Find content mentions with the same unit but a conflicting value
      const contentMentions = mentions.filter(
        m => m.unit === fm.unit && valuesConflict(m.value, fm.value),
      );
      for (const cm of contentMentions) {
        qaConflicts.push({
          qaFact: { question: fact.question, answer: fact.answer, confidence: fact.confidence },
          mention: cm,
          description:
            `QA fact "${fact.question}" = ${fm.raw} ↔ content ${cm.section}: ${cm.raw}`,
        });
      }
    }
  }

  // Deduplicate: one entry per (qa fact question, content section, unit) triple
  const seen = new Set<string>();
  return qaConflicts.filter(c => {
    const key = `${c.qaFact.question}|${c.mention.section}|${c.mention.unit}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function valuesConflict(a: number, b: number): boolean {
  if (a === b) return false;
  const larger = Math.max(Math.abs(a), Math.abs(b));
  if (larger === 0) return false;
  return Math.abs(a - b) / larger > CONFLICT_THRESHOLD;
}
