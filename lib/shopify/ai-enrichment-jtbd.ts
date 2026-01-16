/**
 * GAP 14: Enhanced AI Content Generation with JTBD Fields
 * 
 * This module extends the base AI enrichment with JTBD-specific fields
 * that sync with the frontend components:
 * - JTBDDimensions.tsx
 * - FourForces.tsx
 * - JobStory.tsx
 * - CurrentSolution.tsx
 */

import { EnrichedProductData } from './webhook-types';

/**
 * Extended enrichment data with JTBD fields
 */
export interface JTBDEnrichedData extends EnrichedProductData {
  // JTBD 3 Dimensions
  jtbdDimensions: {
    functional: string;  // The practical task
    emotional: string;   // How they want to feel
    social: string;      // How they want to be perceived
  };
  
  // JTBD 4 Forces
  fourForces: {
    push: string;        // Frustration with current solution
    pull: string;        // Attraction to new solution
    anxiety: string;     // Fear of change
    habit: string;       // Comfort with status quo
  };
  
  // Job Stories (When/Want/So format)
  jobStories: {
    situation: string;
    motivation: string;
    outcome: string;
  }[];
  
  // Current solutions analysis
  currentSolutions: {
    solution: string;
    painPoints: string[];
    upgradeRecommended: boolean;
    reason: string;
  }[];
  
  // Quick summary fields
  targetProfession: string;
  quickVerdict: string;
  competitorPrices: {
    amazon: string | null;
    leroyMerlin: string | null;
    otherRetailer: string | null;
  };
}

/**
 * Enhanced system prompt for JTBD-aware content generation
 */
export const JTBD_SYSTEM_PROMPT_EXTENSION = `

## JTBD FRAMEWORK (Clayton Christensen)

Per ogni prodotto, devi pensare in termini di "job to be done":

### Le 3 Dimensioni del Job

1. **Funzionale**: Qual è il compito pratico che il cliente deve completare?
   Esempio: "Forare 50 fori nel cemento armato in una giornata"

2. **Emotivo**: Come vuole sentirsi il cliente durante e dopo il lavoro?
   Esempio: "Sicuro di non dover tornare a casa a metà giornata per batteria scarica"

3. **Sociale**: Come vuole essere percepito dai colleghi/clienti?
   Esempio: "Come un professionista che usa attrezzatura seria"

### Le 4 Forze del Progresso

1. **Push**: Cosa lo frustra della soluzione attuale?
   Esempio: "Il trapano a filo mi limita nei movimenti"

2. **Pull**: Cosa lo attrae della nuova soluzione?
   Esempio: "Libertà di movimento e più produttività"

3. **Ansia**: Cosa lo preoccupa del cambiamento?
   Esempio: "Costa tanto, e se poi non è compatibile con le mie punte?"

4. **Abitudine**: Cosa lo tiene legato alla soluzione attuale?
   Esempio: "Ho sempre usato questo brand, lo conosco"

### Job Stories Format

Usa questo formato: "Quando [situazione], voglio [motivazione], così posso [risultato atteso]"

Esempio: "Quando sono in un quadro elettrico stretto, voglio un trapano compatto, così posso lavorare senza smontare pannelli"
`;

/**
 * Enhanced JSON schema for AI response
 */
export const JTBD_JSON_SCHEMA = `{
  "description": "...",
  "pros": ["...", "...", "..."],
  "cons": ["...", "..."],
  "faqs": [
    {"question": "...", "answer": "..."},
    {"question": "...", "answer": "..."},
    {"question": "...", "answer": "..."}
  ],
  "jtbdDimensions": {
    "functional": "Il compito pratico che risolve",
    "emotional": "Come fa sentire l'utente",
    "social": "Come viene percepito chi lo usa"
  },
  "fourForces": {
    "push": "Frustrazione con la soluzione attuale",
    "pull": "Attrazione verso questa soluzione",
    "anxiety": "Preoccupazione principale del cliente",
    "habit": "Cosa lo tiene legato allo status quo"
  },
  "jobStories": [
    {
      "situation": "Quando...",
      "motivation": "Voglio...",
      "outcome": "Così posso..."
    }
  ],
  "currentSolutions": [
    {
      "solution": "Nome della soluzione attuale",
      "painPoints": ["Problema 1", "Problema 2"],
      "upgradeRecommended": true,
      "reason": "Perché questo prodotto è meglio"
    }
  ],
  "targetProfession": "Elettricista / Muratore / Meccanico / etc.",
  "quickVerdict": "Verdetto in una frase (max 15 parole)",
  "competitorPrices": {
    "amazon": "€XXX (se noto)",
    "leroyMerlin": "€XXX (se noto)",
    "otherRetailer": null
  }
}`;

/**
 * Validate JTBD enriched data
 */
export function validateJTBDData(data: unknown): data is JTBDEnrichedData {
  if (!data || typeof data !== 'object') return false;
  
  const d = data as Record<string, unknown>;
  
  // Check base fields
  if (!d.description || !Array.isArray(d.pros) || !Array.isArray(d.cons)) {
    return false;
  }
  
  // Check JTBD dimensions
  if (!d.jtbdDimensions || typeof d.jtbdDimensions !== 'object') {
    return false;
  }
  
  const dims = d.jtbdDimensions as Record<string, unknown>;
  if (!dims.functional || !dims.emotional || !dims.social) {
    return false;
  }
  
  // Check four forces
  if (!d.fourForces || typeof d.fourForces !== 'object') {
    return false;
  }
  
  const forces = d.fourForces as Record<string, unknown>;
  if (!forces.push || !forces.pull || !forces.anxiety || !forces.habit) {
    return false;
  }
  
  return true;
}

/**
 * Generate fallback JTBD data when AI fails
 */
export function generateFallbackJTBDData(productTitle: string, brand: string): Partial<JTBDEnrichedData> {
  return {
    jtbdDimensions: {
      functional: `Completare lavori professionali con efficienza`,
      emotional: `Sentirsi sicuro di avere l'attrezzatura giusta`,
      social: `Essere riconosciuto come professionista serio`,
    },
    fourForces: {
      push: `Frustrazione con utensili che non reggono l'uso intensivo`,
      pull: `Qualità ${brand} con garanzia e assistenza italiana`,
      anxiety: `Investimento importante - vale la pena?`,
      habit: `Abitudine a usare utensili di altra marca`,
    },
    jobStories: [
      {
        situation: `sono in cantiere con tempi stretti`,
        motivation: `avere un utensile affidabile che non mi rallenta`,
        outcome: `consegnare il lavoro in tempo`,
      },
    ],
    currentSolutions: [
      {
        solution: `Utensile economico/hobbistico`,
        painPoints: [`Durata limitata`, `Prestazioni insufficienti`],
        upgradeRecommended: true,
        reason: `Un utensile professionale si ripaga in produttività`,
      },
    ],
    targetProfession: `Professionista dell'edilizia`,
    quickVerdict: `Utensile professionale ${brand} per chi lavora sul serio`,
    competitorPrices: {
      amazon: null,
      leroyMerlin: null,
      otherRetailer: null,
    },
  };
}
