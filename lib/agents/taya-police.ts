/**
 * TAYA POLICE - Content Validation Module
 * 
 * Validates generated content against TAYA philosophy rules:
 * - Scans for banned marketing phrases
 * - Triggers correction calls to Claude when violations found
 * - Ensures content is clean before saving to Shopify
 */

import Anthropic from '@anthropic-ai/sdk';

// =============================================================================
// BANNED PHRASES (from core-philosophy)
// =============================================================================

export const BANNED_PHRASES = [
  // Generic marketing fluff
  'leader di settore',
  'leader del settore',
  'soluzione a 360 gradi',
  'eccellenza',
  'qualità superiore',
  'il migliore',
  'i migliori',
  'straordinario',
  'eccezionale',
  'all\'avanguardia',
  'perfetto',
  'alta qualità',
  'massima qualità',
  'questo prodotto',
  'questo articolo',
  
  // Empty superlatives
  'incredibile',
  'fantastico',
  'rivoluzionario',
  'innovativo',
  'unico nel suo genere',
  'senza pari',
  'impareggiabile',
  'insuperabile',
  'imbattibile',
  
  // Corporate speak
  'sinergia',
  'ottimizzare',
  'leverage',
  'best practice',
  'win-win',
  'proattivo',
  'scalabile',
  
  // Vague claims
  'prestazioni eccezionali',
  'qualità eccezionale',
  'risultati straordinari',
  'esperienza unica',
  'servizio impeccabile',
];

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
}

// =============================================================================
// VALIDATION FUNCTIONS
// =============================================================================

/**
 * Scan text for banned phrases
 */
function findBannedPhrases(text: string): { phrase: string; context: string }[] {
  const violations: { phrase: string; context: string }[] = [];
  const textLower = text.toLowerCase();
  
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
// CORRECTION CALL
// =============================================================================

/**
 * Call Claude to fix content with banned phrases
 */
export async function correctContent(
  content: ContentToValidate,
  violations: Violation[]
): Promise<CleanedContent> {
  const anthropic = new Anthropic();
  
  // Group violations by phrase
  const uniquePhrases = Array.from(new Set(violations.map(v => v.phrase)));
  
  const prompt = `Sei il correttore di bozze del Team Autonord. Hai trovato parole vietate dalla filosofia TAYA nel contenuto.

PAROLE VIETATE TROVATE:
${uniquePhrases.map(p => `- "${p}"`).join('\n')}

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
2. Sostituisci il marketing fluff con fatti concreti e specifici
3. Mantieni lo stesso significato ma con linguaggio onesto
4. NON aggiungere nuove informazioni, solo riformula

ESEMPI DI CORREZIONE:
- "prestazioni eccezionali" → "135 Nm di coppia, sufficiente per cemento armato"
- "qualità superiore" → "costruzione in metallo, garanzia 5 anni"
- "il migliore" → "tra i più potenti della categoria M18"
- "leader di settore" → "brand scelto dal 40% degli elettricisti professionisti"

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
    const response = await anthropic.messages.create({
      model: 'claude-opus-4-20250514',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    });

    const textBlock = response.content.find(block => block.type === 'text');
    const responseText = textBlock?.type === 'text' ? textBlock.text : null;
    
    if (!responseText) {
      throw new Error('Empty response from Claude');
    }

    // Parse JSON response
    const cleanedText = responseText
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();

    const cleaned = JSON.parse(cleanedText) as CleanedContent;
    
    // Validate the cleaned content doesn't have violations
    const recheck = validateContent(cleaned);
    
    if (!recheck.isValid) {
      console.warn('[TAYA Police] Correction still has violations, using original with manual fixes');
      // Apply simple replacements as fallback
      return applySimpleReplacements(content, uniquePhrases);
    }
    
    return cleaned;
    
  } catch (error) {
    console.error('[TAYA Police] Correction error:', error);
    // Fallback to simple replacements
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
  const replacements: Record<string, string> = {
    'leader di settore': 'brand professionale',
    'leader del settore': 'brand professionale',
    'eccellenza': 'qualità professionale',
    'qualità superiore': 'costruzione robusta',
    'il migliore': 'tra i più performanti',
    'i migliori': 'tra i più performanti',
    'straordinario': 'notevole',
    'eccezionale': 'solido',
    'all\'avanguardia': 'moderno',
    'perfetto': 'adatto',
    'alta qualità': 'costruzione solida',
    'massima qualità': 'costruzione professionale',
    'questo prodotto': 'questo utensile',
    'questo articolo': 'questo utensile',
    'incredibile': 'notevole',
    'fantastico': 'valido',
    'rivoluzionario': 'innovativo nella categoria',
    'innovativo': 'con tecnologia recente',
    'unico nel suo genere': 'distintivo',
    'senza pari': 'competitivo',
    'impareggiabile': 'di alto livello',
    'insuperabile': 'tra i migliori della categoria',
    'imbattibile': 'competitivo',
    'prestazioni eccezionali': 'prestazioni solide',
    'qualità eccezionale': 'buona costruzione',
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
// MAIN VALIDATION PIPELINE
// =============================================================================

/**
 * Full validation pipeline: validate and correct if needed
 */
export async function validateAndCorrect(
  content: ContentToValidate
): Promise<{ content: CleanedContent; wasFixed: boolean; violations: Violation[] }> {
  console.log('[TAYA Police] 🚔 Scanning content for violations...');
  
  const validation = validateContent(content);
  
  if (validation.isValid) {
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
    };
  }
  
  console.log(`[TAYA Police] ⚠️ Found ${validation.violations.length} violations`);
  for (const v of validation.violations) {
    console.log(`  - "${v.phrase}" in ${v.field}`);
  }
  
  console.log('[TAYA Police] 🔧 Calling Claude for correction...');
  const corrected = await correctContent(content, validation.violations);
  
  console.log('[TAYA Police] ✅ Content corrected');
  
  return {
    content: corrected,
    wasFixed: true,
    violations: validation.violations,
  };
}

// =============================================================================
// EXPORTS
// =============================================================================

export { findBannedPhrases };
