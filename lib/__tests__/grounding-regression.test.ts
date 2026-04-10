/**
 * Regression dataset — groundingCheck() + hallucinationPostCheck()
 *
 * 54 labelled (evidenceText, inputFact) → expectedOutput pairs organised into
 * seven behavioural families. Run with: pnpm test
 *
 * Adding a new pair:
 *   1. Pick the right GROUND_TRUTH_* array below.
 *   2. Add an entry with evidenceText, inputFact, and the expected outcome.
 *   3. The table-driven test loop picks it up automatically — no new it() needed.
 *
 * Confidence after grounding downgrade rules (from two-phase-qa.ts):
 *   high  → medium  (numeric value not found)
 *   medium → medium (unchanged by numeric check)
 *   high  → low     (textual claim not found)
 *
 * hallucinationPostCheck confidence-cap rule:
 *   verified=false + confidence='high' → confidence='medium'
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/shopify/ai-client', () => ({
  generateTextSafe: vi.fn().mockResolvedValue({ text: '{}' }),
}));
vi.mock('@/lib/env', () => ({
  env: {
    SHOPIFY_ADMIN_ACCESS_TOKEN: 'test-token',
    CRON_SECRET: 'test-secret',
    GOOGLE_GENERATIVE_AI_API_KEY: 'test-key',
  },
  optionalEnv: {},
  toShopifyGid: (id: string, _type: string) => `gid://shopify/Product/${id}`,
}));
vi.mock('@/lib/pipeline-trace', () => ({
  recordAiCallToCurrentStep: vi.fn(),
  recordCacheHitToCurrentStep: vi.fn(),
}));

import { groundingCheck, hallucinationPostCheck } from '@/lib/shopify/two-phase-qa';
import type { AtomicFact } from '@/lib/shopify/two-phase-qa';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fact(
  question: string,
  answer: string,
  opts: { confidence?: 'high' | 'medium' | 'low'; verified?: boolean } = {},
): AtomicFact {
  return {
    question,
    answer,
    source: 'test-evidence',
    confidence: opts.confidence ?? 'high',
    verified: opts.verified ?? true,
  };
}

// ---------------------------------------------------------------------------
// Ground-truth dataset — groundingCheck()
// ---------------------------------------------------------------------------

// ── Family A: numeric grounding PASS ─────────────────────────────────────────
// The extracted number IS present in the evidence → fact should be unchanged.
interface GroundingCase {
  id: string;
  evidenceText: string;
  inputFact: AtomicFact;
  expectedVerified: boolean;
  expectedConfidenceAtMost?: 'high' | 'medium' | 'low';
}

const NUMERIC_PASS: GroundingCase[] = [
  {
    id: 'A01',
    evidenceText: 'Il Milwaukee M18 BLPD2 eroga una coppia massima di 135 Nm in modalità drill.',
    inputFact: fact('Coppia massima?', '135 Nm'),
    expectedVerified: true,
  },
  {
    id: 'A02',
    evidenceText: 'Avvitatore da 60 Nm, ideale per bulloni M8.',
    inputFact: fact('Coppia?', '60 Nm'),
    expectedVerified: true,
  },
  {
    id: 'A03',
    evidenceText: 'Peso netto: 2,1 kg con batteria 2 Ah inclusa.',
    inputFact: fact('Peso?', '2.1 kg'), // dot instead of comma
    expectedVerified: true,
  },
  {
    id: 'A04',
    evidenceText: 'Pesa appena 1.8 kg senza batteria.',
    inputFact: fact('Peso?', '1.8 kg'),
    expectedVerified: true,
  },
  {
    id: 'A05',
    evidenceText: 'Tensione nominale 18 V, compatibile con tutte le batterie M18.',
    inputFact: fact('Tensione?', '18 V'),
    expectedVerified: true,
  },
  {
    id: 'A06',
    evidenceText: 'Mandrino da 13 mm per punte standard. RPM max 1800.',
    inputFact: fact('Diametro mandrino?', '13 mm'),
    expectedVerified: true,
  },
  {
    id: 'A07',
    evidenceText: 'Velocità a vuoto: 0–480 rpm / 0–1800 rpm selezionabile.',
    inputFact: fact('RPM massimo?', '1800 rpm'),
    expectedVerified: true,
  },
  {
    id: 'A08',
    evidenceText: 'Potenza nominale 1200 W, motore universale.',
    inputFact: fact('Potenza?', '1200 W'),
    expectedVerified: true,
  },
  {
    id: 'A09',
    evidenceText: 'Pressione massima 4.5 bar. Serbatoio da 50 litri.',
    inputFact: fact('Pressione max?', '4.5 bar'),
    expectedVerified: true,
  },
  {
    id: 'A10',
    evidenceText: 'Portata d\'aria: 120 l/min. Connettore rapido incluso.',
    inputFact: fact('Portata?', '120 l/min'),
    expectedVerified: true,
  },
  {
    id: 'A11',
    evidenceText: 'Motore monocilindrico 196 cc, avviamento a strappo.',
    inputFact: fact('Cilindrata?', '196 cc'),
    expectedVerified: true,
  },
  {
    id: 'A12',
    evidenceText: 'Autonomia 8 ore con pieno da 5,5 litri a carico al 50%.',
    inputFact: fact('Autonomia?', '8 ore'),
    expectedVerified: true,
  },
  {
    id: 'A13',
    evidenceText: 'Capacità batteria 5 Ah, ricarica in 60 minuti con caricabatterie rapido.',
    inputFact: fact('Capacità batteria?', '5 Ah'),
    expectedVerified: true,
  },
  {
    id: 'A14',
    evidenceText: 'Livello di pressione sonora 72 dB(A), vibrazione 4,5 m/s².',
    inputFact: fact('Rumorosità?', '72 dB'),
    expectedVerified: true,
  },
];

// ── Family B: numeric grounding FAIL ─────────────────────────────────────────
// The extracted number is NOT present in evidence → verified=false expected.
// NOTE: all evidence strings must be > 50 chars — groundingCheck() skips
// shorter evidence as a safety measure (too little context to judge).
const NUMERIC_FAIL: GroundingCase[] = [
  {
    id: 'B01',
    evidenceText: 'Il Milwaukee M18 BLPD2 eroga una coppia massima di 135 Nm in modalità drill. Peso: 2,1 kg.',
    inputFact: fact('Coppia massima?', '200 Nm'), // hallucinated value
    expectedVerified: false,
    expectedConfidenceAtMost: 'medium',
  },
  {
    id: 'B02',
    evidenceText: 'Peso netto dichiarato dal costruttore: 2,1 kg con batteria RedLithium 2 Ah inclusa.',
    inputFact: fact('Peso?', '3.5 kg'),
    expectedVerified: false,
    expectedConfidenceAtMost: 'medium',
  },
  {
    id: 'B03',
    evidenceText: 'Piattaforma 18 V compatibile con tutte le batterie RedLithium M18. Mandrino 13 mm.',
    inputFact: fact('Tensione?', '14.4 V'),
    expectedVerified: false,
    expectedConfidenceAtMost: 'medium',
  },
  {
    id: 'B04',
    evidenceText: 'Mandrino a sgancio rapido da 13 mm per punte standard. Coppia max 135 Nm.',
    inputFact: fact('Diametro mandrino?', '10 mm'),
    expectedVerified: false,
    expectedConfidenceAtMost: 'medium',
  },
  {
    id: 'B05',
    evidenceText: 'Potenza nominale del motore 1200 W, avvio morbido integrato per ridurre i rimbalzi.',
    inputFact: fact('Potenza?', '2000 W'),
    expectedVerified: false,
    expectedConfidenceAtMost: 'medium',
  },
  {
    id: 'B06',
    evidenceText: 'Pressione massima di esercizio 4.5 bar, adatto per pistole pneumatiche da carrozzeria.',
    inputFact: fact('Pressione max?', '8 bar'),
    expectedVerified: false,
    expectedConfidenceAtMost: 'medium',
  },
  {
    id: 'B07',
    evidenceText: 'Velocità a vuoto: 0–480 rpm in prima marcia e 0–1800 rpm in seconda marcia.',
    inputFact: fact('RPM massimo?', '3000 rpm'),
    expectedVerified: false,
    expectedConfidenceAtMost: 'medium',
  },
  {
    id: 'B08',
    evidenceText: 'Batteria RedLithium da 18 V / 2 Ah inclusa. Ricarica completa in 60 minuti.',
    inputFact: fact('Capacità batteria?', '5 Ah'),
    expectedVerified: false,
    expectedConfidenceAtMost: 'medium',
  },
  {
    id: 'B09',
    evidenceText: 'Livello di pressione sonora certificato: 72 dB(A). Protezioni auricolari consigliate.',
    inputFact: fact('Rumorosità?', '95 dB'),
    expectedVerified: false,
    expectedConfidenceAtMost: 'medium',
  },
  {
    id: 'B10',
    evidenceText: 'Coppia massima 135 Nm. Peso netto 2,1 kg. Tensione 18 V. Mandrino 13 mm a sgancio rapido.',
    inputFact: fact('Autonomia?', '12 ore'), // 12 not in evidence
    expectedVerified: false,
    expectedConfidenceAtMost: 'medium',
  },
];

// ── Family C: Italian word-number normalization (W-QA-2) ─────────────────────
const WORD_NUMBER_PASS: GroundingCase[] = [
  {
    id: 'C01',
    evidenceText: 'La coppia massima è centotrentacinque Newton metro, certificata.',
    inputFact: fact('Coppia massima?', '135 Nm'),
    expectedVerified: true,
  },
  {
    id: 'C02',
    evidenceText: 'Tensione nominale diciotto volt, piattaforma M18.',
    inputFact: fact('Tensione?', '18 V'),
    expectedVerified: true,
  },
  {
    id: 'C03',
    // "ottocento" = 800 — single-word compound parseable by italianWordToNumber
    evidenceText: 'Portata massima ottocento litri per ora a piena potenza della pompa.',
    inputFact: fact('Portata?', '800 l/h'),
    expectedVerified: true,
  },
  {
    id: 'C04',
    evidenceText: 'RPM a vuoto: trecentosessanta giri al minuto in prima velocità.',
    inputFact: fact('RPM min?', '360 rpm'),
    expectedVerified: true,
  },
  {
    id: 'C05',
    evidenceText: 'Batteria da settantadue wattora inclusa nella confezione.',
    inputFact: fact('Energia batteria?', '72 Wh'),
    expectedVerified: true,
  },
  {
    id: 'C06',
    evidenceText: 'Potenza nominale milleduecento watt, avvio morbido integrato.',
    inputFact: fact('Potenza?', '1200 W'),
    expectedVerified: true,
  },
];

// ── Family D: textual claim grounding (D10) — PASS ───────────────────────────
const TEXTUAL_PASS: GroundingCase[] = [
  {
    id: 'D01',
    evidenceText: 'Trapano con motore brushless ad alta efficienza energetica.',
    inputFact: fact('Tipo motore?', 'brushless'),
    expectedVerified: true,
  },
  {
    id: 'D02',
    evidenceText: 'Motore senza carboni, nessuna manutenzione ordinaria richiesta.',
    inputFact: fact('Tipo motore?', 'brushless'),
    expectedVerified: true,
  },
  {
    id: 'D03',
    evidenceText: 'Tecnologia senza spazzole: durata +50% rispetto ai modelli tradizionali.',
    inputFact: fact('Tipo motore?', 'brushless'),
    expectedVerified: true,
  },
  {
    id: 'D04',
    evidenceText: 'Protezione IP67: sommergibile fino a 1 m per 30 minuti.',
    inputFact: fact('Protezione IP?', 'IP67'),
    expectedVerified: true,
  },
  {
    id: 'D05',
    evidenceText: 'Compressore oil-free: nessuna aggiunta di olio necessaria.',
    inputFact: fact('Tipo compressore?', 'oil-free'),
    expectedVerified: true,
  },
  {
    id: 'D06',
    evidenceText: 'Filtro HEPA H13 certificato per la ritenzione di particelle fini.',
    inputFact: fact('Tipo filtro?', 'HEPA'),
    expectedVerified: true,
  },
  {
    id: 'D07',
    evidenceText: 'Connettività Bluetooth One-Key per il monitoraggio remoto dell\'utensile.',
    inputFact: fact('Connettività?', 'Bluetooth'),
    expectedVerified: true,
  },
];

// ── Family E: textual claim grounding (D10) — FAIL ───────────────────────────
const TEXTUAL_FAIL: GroundingCase[] = [
  {
    id: 'E01',
    evidenceText: 'Trapano con motore a spazzole tradizionale. Peso 1.8 kg.',
    inputFact: fact('Tipo motore?', 'brushless'),
    expectedVerified: false,
  },
  {
    id: 'E02',
    // Evidence must be > 50 chars to trigger grounding check (not bypass via short-evidence guard).
    // Must NOT contain "brushless", "senza spazzole", or "senza carboni" (synonyms that would pass).
    evidenceText: 'Motore universale ad alta velocità, 1200 W. Carboni di ricambio inclusi nella confezione.',
    inputFact: fact('Tipo motore?', 'brushless'),
    expectedVerified: false,
  },
  {
    id: 'E03',
    evidenceText: 'Protezione IP54 contro schizzi d\'acqua e polvere fine.',
    inputFact: fact('Protezione IP?', 'IP67'), // has IP54, not IP67
    expectedVerified: false,
  },
  {
    id: 'E04',
    evidenceText: 'Compressore a olio, lubrificazione ogni 500 ore d\'esercizio.',
    inputFact: fact('Tipo compressore?', 'oil-free'),
    expectedVerified: false,
  },
  {
    id: 'E05',
    // Avoid any substring of "hepa" — TEXTUAL_CLAIM_SYNONYMS contains 'hepa' so
    // evidence with "HEPA" (case-insensitive) would accidentally pass the grounding check.
    evidenceText: 'Aspirapolvere con filtro a cartuccia lavabile, non idoneo per particelle submicrometriche.',
    inputFact: fact('Tipo filtro?', 'HEPA'),
    expectedVerified: false,
  },
  {
    id: 'E06',
    evidenceText: 'Connessione solo via cavo USB per aggiornamenti firmware.',
    inputFact: fact('Connettività?', 'Bluetooth'),
    expectedVerified: false,
  },
  {
    id: 'E07',
    evidenceText: 'Manuale utente in italiano e inglese. Coppia 95 Nm.',
    inputFact: fact('Protezione?', 'impermeabile'),
    expectedVerified: false,
  },
];

// ── Family F: NON TROVATO and non-numeric pass-through ───────────────────────
const PASSTHROUGH: GroundingCase[] = [
  {
    id: 'F01',
    evidenceText: 'Il Milwaukee M18 è disponibile in tutta Italia.',
    inputFact: fact('Colore?', 'NON TROVATO', { confidence: 'low' }),
    expectedVerified: true, // NON TROVATO facts are always passed through unchanged
  },
  {
    id: 'F02',
    evidenceText: 'Prodotto certificato CE, conforme alle norme europee.',
    inputFact: fact('Disponibile in Italia?', 'Sì'), // non-numeric, no textual claim
    expectedVerified: true,
  },
  {
    id: 'F03',
    evidenceText: 'Garanzia: NON TROVATO nella scheda tecnica.',
    inputFact: fact('Garanzia?', 'NON TROVATO', { confidence: 'low', verified: false }),
    expectedVerified: false, // NON TROVATO stays as-is (verified=false preserved)
  },
  {
    id: 'F04',
    // Evidence shorter than 50 chars → groundingCheck skips ALL checks
    evidenceText: 'Trapano M18. 135 Nm.',
    inputFact: fact('Coppia?', '999 Nm'), // 999 not in evidence, but evidence too short
    expectedVerified: true, // short evidence → no grounding → stays verified
  },
];

// ---------------------------------------------------------------------------
// Ground-truth dataset — hallucinationPostCheck()
// ---------------------------------------------------------------------------

interface HallucinationCase {
  id: string;
  evidenceText: string;
  inputFact: AtomicFact;
  expectedAnswer: string;
  expectedVerified: boolean;
  expectedConfidenceAtMost?: 'high' | 'medium' | 'low';
  description: string;
}

const HALLUCINATION_CASES: HallucinationCase[] = [
  // ── G: Short evidence + unverified → NON TROVATO ─────────────────────────
  {
    id: 'G01',
    evidenceText: 'Trapano Milwaukee M18. Peso 1.8 kg.',
    // Short evidence (<200 chars) + fact is unverified → forces NON TROVATO
    inputFact: fact('Garanzia?', '2 anni', { confidence: 'medium', verified: false }),
    expectedAnswer: 'NON TROVATO',
    expectedVerified: false,
    description: 'Short evidence + unverified → NON TROVATO',
  },
  {
    id: 'G02',
    evidenceText: 'Avvitatore compatto 18 V.',
    inputFact: fact('Rumorosità?', '72 dB', { confidence: 'low', verified: false }),
    expectedAnswer: 'NON TROVATO',
    expectedVerified: false,
    description: 'Short evidence + unverified low-confidence → NON TROVATO',
  },
  {
    id: 'G03',
    // Short evidence but fact IS verified → NOT forced to NON TROVATO
    evidenceText: 'Coppia 135 Nm, 18 V.',
    inputFact: fact('Coppia?', '135 Nm', { confidence: 'high', verified: true }),
    expectedAnswer: '135 Nm',
    expectedVerified: true,
    description: 'Short evidence + verified → stays unchanged',
  },
  {
    id: 'G04',
    // Long evidence + unverified → NOT affected by short-evidence heuristic
    evidenceText:
      'Il Milwaukee M18 BLPD2 è un trapano avvitatore professionale dotato di motore brushless. ' +
      'Eroga una coppia massima di 135 Nm in modalità foratura. Peso: 2,1 kg. ' +
      'Compatible con tutte le batterie RedLithium M18.',
    inputFact: fact('Rumorosità?', '72 dB', { confidence: 'medium', verified: false }),
    expectedAnswer: '72 dB', // long evidence → heuristic G1 NOT triggered
    expectedVerified: false,
    description: 'Long evidence + unverified → NOT forced to NON TROVATO',
  },

  // ── H: Suspicious warranty defaults ──────────────────────────────────────
  {
    id: 'H01',
    evidenceText:
      'Il Milwaukee M18 BLPD2 è coperto da garanzia Milwaukee di tre anni sulle parti. ' +
      'Registrazione online entro 30 giorni dall\'acquisto richiesta.',
    // "2 anni" is a suspicious default that is NOT in the evidence
    inputFact: fact('Garanzia?', '2 anni', { confidence: 'high', verified: true }),
    expectedAnswer: 'NON TROVATO',
    expectedVerified: false,
    description: '"2 anni" warranty default not in evidence → NON TROVATO',
  },
  {
    id: 'H02',
    // "2 anni" IS in the evidence → should NOT be forced to NON TROVATO
    evidenceText:
      'Garanzia ufficiale Milwaukee: 2 anni dalla data di acquisto, estendibile a 5 anni ' +
      'con registrazione online.',
    inputFact: fact('Garanzia?', '2 anni', { confidence: 'high', verified: true }),
    expectedAnswer: '2 anni',
    expectedVerified: true,
    description: '"2 anni" in evidence → stays',
  },
  {
    id: 'H03',
    evidenceText:
      'Scheda tecnica Milwaukee M18FPD2. Coppia: 135 Nm. Peso: 2.1 kg.',
    inputFact: fact('Garanzia?', '24 mesi', { confidence: 'high', verified: true }),
    expectedAnswer: 'NON TROVATO',
    expectedVerified: false,
    description: '"24 mesi" suspicious default not in evidence → NON TROVATO',
  },
  {
    id: 'H04',
    evidenceText:
      'Offerta speciale: acquisto entro fine mese. 18 V, 60 Nm.',
    inputFact: fact('Garanzia?', '2 years', { confidence: 'medium', verified: true }),
    expectedAnswer: 'NON TROVATO',
    expectedVerified: false,
    description: '"2 years" suspicious default not in evidence → NON TROVATO',
  },
  {
    id: 'H05',
    // Non-default warranty answer → never forced to NON TROVATO by this heuristic
    evidenceText: 'Garanzia 5 anni Milwaukee per uso professionale.',
    inputFact: fact('Garanzia?', '5 anni', { confidence: 'high', verified: true }),
    expectedAnswer: '5 anni',
    expectedVerified: true,
    description: 'Non-default warranty value → stays unchanged',
  },
  {
    id: 'H06',
    evidenceText: 'Coppia 95 Nm. Peso 2.3 kg. Nessuna garanzia indicata.',
    inputFact: fact('Garanzia?', '1 anno', { confidence: 'medium', verified: false }),
    // "1 anno" IS a suspicious default per SUSPICIOUS_DEFAULTS ('1 anno')
    expectedAnswer: 'NON TROVATO',
    expectedVerified: false,
    description: '"1 anno" suspicious default not in evidence → NON TROVATO',
  },

  // ── I: Confident-but-wrong confidence cap ────────────────────────────────
  {
    id: 'I01',
    // verified=false with confidence='high' → cap to 'medium'.
    // Evidence MUST be > 200 chars so the short-evidence heuristic (G1) does NOT fire
    // and force the answer to NON TROVATO before the confidence-cap heuristic runs.
    evidenceText:
      'Milwaukee M18 BLPD2 è un trapano avvitatore professionale di fascia alta. ' +
      'Coppia massima certificata: 135 Nm in modalità foratura singola. ' +
      'Peso netto con batteria RedLithium 2 Ah: 2,1 kg. ' +
      'Tensione nominale: 18 V. Mandrino a sgancio rapido da 13 mm. ' +
      'Velocità a vuoto: 0–480 rpm (marcia 1) e 0–1800 rpm (marcia 2).',
    inputFact: fact('Coppia massima?', '200 Nm', { confidence: 'high', verified: false }),
    expectedAnswer: '200 Nm',
    expectedVerified: false,
    expectedConfidenceAtMost: 'medium',
    description: 'verified=false + confidence=high → capped to medium',
  },
  {
    id: 'I02',
    // verified=false with confidence='medium' → stays 'medium' (no cap needed).
    // Evidence MUST be > 200 chars so the short-evidence heuristic (G1) does NOT fire.
    evidenceText:
      'Milwaukee M18 BLPD2. Coppia: 135 Nm. Peso: 2,1 kg. Tensione: 18 V. ' +
      'Mandrino 13 mm. Velocità: 480 / 1800 rpm. Livello sonoro: 72 dB(A). ' +
      'Autonomia stimata 4 ore con batteria 2 Ah. Garanzia Milwaukee: 3 anni.',
    inputFact: fact('Coppia massima?', '200 Nm', { confidence: 'medium', verified: false }),
    expectedAnswer: '200 Nm',
    expectedVerified: false,
    description: 'verified=false + confidence=medium → stays medium',
  },
  {
    id: 'I03',
    // verified=true + confidence='high' → stays unchanged
    evidenceText:
      'Milwaukee M18 BLPD2. Coppia: 135 Nm.',
    inputFact: fact('Coppia massima?', '135 Nm', { confidence: 'high', verified: true }),
    expectedAnswer: '135 Nm',
    expectedVerified: true,
    description: 'verified=true + confidence=high → completely unchanged',
  },

  // ── J: NON TROVATO pass-through ──────────────────────────────────────────
  {
    id: 'J01',
    evidenceText: 'Prodotto compatto e leggero.',
    inputFact: fact('Peso?', 'NON TROVATO', { confidence: 'low', verified: false }),
    expectedAnswer: 'NON TROVATO',
    expectedVerified: false,
    description: 'NON TROVATO is always passed through unchanged',
  },
  {
    id: 'J02',
    evidenceText: '', // empty evidence
    inputFact: fact('Garanzia?', 'NON TROVATO', { confidence: 'low', verified: false }),
    expectedAnswer: 'NON TROVATO',
    expectedVerified: false,
    description: 'NON TROVATO with empty evidence → unchanged',
  },
];

// ---------------------------------------------------------------------------
// Table-driven test execution — groundingCheck()
// ---------------------------------------------------------------------------

function runGroundingDataset(cases: GroundingCase[], label: string) {
  describe(`groundingCheck() — ${label}`, () => {
    for (const tc of cases) {
      it(`[${tc.id}] ${tc.inputFact.question} → "${tc.inputFact.answer}"`, () => {
        const result = groundingCheck([tc.inputFact], tc.evidenceText);
        expect(result).toHaveLength(1);
        const out = result[0];
        expect(out.verified).toBe(tc.expectedVerified);
        if (tc.expectedConfidenceAtMost === 'medium') {
          expect(['medium', 'low']).toContain(out.confidence);
        }
        if (tc.expectedConfidenceAtMost === 'low') {
          expect(out.confidence).toBe('low');
        }
      });
    }
  });
}

runGroundingDataset(NUMERIC_PASS, 'numeric PASS (A)');
runGroundingDataset(NUMERIC_FAIL, 'numeric FAIL (B)');
runGroundingDataset(WORD_NUMBER_PASS, 'Italian word-number normalization PASS (C)');
runGroundingDataset(TEXTUAL_PASS, 'textual claim PASS (D)');
runGroundingDataset(TEXTUAL_FAIL, 'textual claim FAIL (E)');
runGroundingDataset(PASSTHROUGH, 'pass-through / edge cases (F)');

// ---------------------------------------------------------------------------
// Table-driven test execution — hallucinationPostCheck()
// ---------------------------------------------------------------------------

describe('hallucinationPostCheck() — regression dataset (G–J)', () => {
  for (const tc of HALLUCINATION_CASES) {
    it(`[${tc.id}] ${tc.description}`, () => {
      const result = hallucinationPostCheck([tc.inputFact], tc.evidenceText);
      expect(result).toHaveLength(1);
      const out = result[0];
      expect(out.answer).toBe(tc.expectedAnswer);
      expect(out.verified).toBe(tc.expectedVerified);
      if (tc.expectedConfidenceAtMost === 'medium') {
        expect(['medium', 'low']).toContain(out.confidence);
      }
    });
  }
});

// ---------------------------------------------------------------------------
// Aggregate sanity: dataset coverage meta-test
// ---------------------------------------------------------------------------

describe('regression dataset — meta', () => {
  const allGroundingCases = [
    ...NUMERIC_PASS,
    ...NUMERIC_FAIL,
    ...WORD_NUMBER_PASS,
    ...TEXTUAL_PASS,
    ...TEXTUAL_FAIL,
    ...PASSTHROUGH,
  ];

  it('has at least 40 groundingCheck pairs', () => {
    expect(allGroundingCases.length).toBeGreaterThanOrEqual(40);
  });

  it('has at least 14 hallucinationPostCheck pairs', () => {
    expect(HALLUCINATION_CASES.length).toBeGreaterThanOrEqual(14);
  });

  it('all grounding case IDs are unique', () => {
    const ids = allGroundingCases.map(c => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('all hallucination case IDs are unique', () => {
    const ids = HALLUCINATION_CASES.map(c => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('grounding dataset covers both PASS and FAIL labels', () => {
    const hasPass = allGroundingCases.some(c => c.expectedVerified === true);
    const hasFail = allGroundingCases.some(c => c.expectedVerified === false);
    expect(hasPass).toBe(true);
    expect(hasFail).toBe(true);
  });

  it('grounding dataset has at least 3 textual-claim cases', () => {
    const textual = [...TEXTUAL_PASS, ...TEXTUAL_FAIL];
    expect(textual.length).toBeGreaterThanOrEqual(3);
  });

  it('grounding dataset has at least 4 Italian word-number cases', () => {
    expect(WORD_NUMBER_PASS.length).toBeGreaterThanOrEqual(4);
  });
});
