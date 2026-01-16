'use client';

import { useState } from 'react';
import { RefreshCw, Check, X, ArrowRight } from 'lucide-react';
import { Product } from '@/lib/shopify/types';
import { getBrandName } from '@/lib/utils';

interface CurrentSolutionProps {
  product: Product;
}

/**
 * GAP 12: "What are you using now?" Section
 * Helps customers understand if this product is right for them
 * Based on JTBD principle: understand the current solution to understand the job
 */
function generateCurrentSolutions(product: Product): {
  solution: string;
  painPoints: string[];
  upgrade: boolean;
  reason: string;
}[] {
  const title = product.title.toLowerCase();
  const brandName = getBrandName(product.vendor);
  const price = parseFloat(product.priceRange.minVariantPrice.amount);
  
  const solutions: { solution: string; painPoints: string[]; upgrade: boolean; reason: string }[] = [];
  
  // Trapano
  if (title.includes('trapano') || title.includes('drill')) {
    solutions.push({
      solution: 'Trapano a filo',
      painPoints: ['Cavo sempre in mezzo', 'Devi cercare prese', 'Limita i movimenti'],
      upgrade: true,
      reason: 'Il cordless ti libera dal cavo e aumenta la produttività del 30%'
    });
    solutions.push({
      solution: 'Trapano 12V economico',
      painPoints: ['Batteria dura poco', 'Poca potenza nel legno duro', 'Plastica fragile'],
      upgrade: price > 200,
      reason: price > 200 ? 'Questo modello ha motore brushless e batterie di qualità superiore' : 'Potrebbe essere sufficiente per le tue esigenze'
    });
    solutions.push({
      solution: 'Trapano 18V di altra marca',
      painPoints: ['Batterie non compatibili', 'Ecosistema limitato'],
      upgrade: false,
      reason: 'Se hai già batterie di un altro sistema, valuta se vale cambiare tutto'
    });
  }
  
  // Avvitatore a impulsi
  if (title.includes('avvitatore') && title.includes('impulsi')) {
    solutions.push({
      solution: 'Chiave a croce manuale',
      painPoints: ['Fatica fisica', 'Tempo perso', 'Rischio infortuni'],
      upgrade: true,
      reason: 'L\'avvitatore a impulsi elimina lo sforzo e velocizza il lavoro 10x'
    });
    solutions.push({
      solution: 'Avvitatore pneumatico',
      painPoints: ['Serve compressore', 'Tubi in mezzo', 'Rumore eccessivo'],
      upgrade: true,
      reason: 'Il cordless è più silenzioso, portatile e non richiede compressore'
    });
    solutions.push({
      solution: 'Avvitatore a impulsi entry-level',
      painPoints: ['Coppia insufficiente', 'Batteria che dura poco'],
      upgrade: price > 300,
      reason: price > 300 ? 'Questo modello ha coppia superiore e batterie professionali' : 'Potrebbe bastare per uso leggero'
    });
  }
  
  // Tassellatore
  if (title.includes('tassellatore') || title.includes('sds')) {
    solutions.push({
      solution: 'Trapano con percussione',
      painPoints: ['Non fora il cemento armato', 'Si surriscalda', 'Punte che si consumano'],
      upgrade: true,
      reason: 'Il tassellatore ha meccanismo pneumatico: fora 5x più veloce nel cemento'
    });
    solutions.push({
      solution: 'Tassellatore a filo',
      painPoints: ['Cavo limita i movimenti', 'Serve prolunga', 'Meno pratico su ponteggi'],
      upgrade: true,
      reason: 'Il cordless ti dà libertà totale di movimento'
    });
  }
  
  // Batterie
  if (title.includes('batteria') || title.includes('battery')) {
    solutions.push({
      solution: 'Batterie originali vecchie',
      painPoints: ['Durano meno di prima', 'Si scaricano in standby', 'Capacità ridotta'],
      upgrade: true,
      reason: 'Le batterie nuove hanno celle migliori e durano di più'
    });
    solutions.push({
      solution: 'Batterie compatibili economiche',
      painPoints: ['Qualità incerta', 'Rischio sicurezza', 'Niente garanzia'],
      upgrade: true,
      reason: 'Le originali sono testate e garantite dal produttore'
    });
  }
  
  // Generic
  if (solutions.length === 0) {
    solutions.push({
      solution: 'Utensile economico/hobbistico',
      painPoints: ['Non dura tutto il giorno', 'Qualità costruttiva inferiore'],
      upgrade: price > 200,
      reason: 'Un utensile professionale si ripaga in produttività e durata'
    });
    solutions.push({
      solution: 'Utensile di altra marca',
      painPoints: ['Batterie non compatibili', 'Ecosistema diverso'],
      upgrade: false,
      reason: 'Valuta se vale cambiare sistema o restare con quello che hai'
    });
  }
  
  return solutions;
}

export function CurrentSolution({ product }: CurrentSolutionProps) {
  const [selectedSolution, setSelectedSolution] = useState<number | null>(null);
  const solutions = generateCurrentSolutions(product);
  
  return (
    <div className="mt-6 border border-border rounded-xl overflow-hidden">
      {/* Header */}
      <div className="bg-muted/50 px-5 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <RefreshCw className="h-5 w-5 text-primary" />
          <h4 className="font-semibold">Cosa Stai Usando Ora?</h4>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Seleziona la tua situazione attuale per capire se questo prodotto fa per te.
        </p>
      </div>
      
      <div className="p-5">
        {/* Solution Options */}
        <div className="space-y-3">
          {solutions.map((sol, index) => (
            <button
              key={index}
              onClick={() => setSelectedSolution(selectedSolution === index ? null : index)}
              className={`w-full text-left p-4 rounded-lg border transition-all ${
                selectedSolution === index 
                  ? 'border-primary bg-primary/5' 
                  : 'border-border hover:border-primary/50 hover:bg-muted/30'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium">{sol.solution}</span>
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                  selectedSolution === index 
                    ? 'border-primary bg-primary' 
                    : 'border-muted-foreground'
                }`}>
                  {selectedSolution === index && <Check className="h-3 w-3 text-primary-foreground" />}
                </div>
              </div>
              
              {/* Pain Points */}
              {selectedSolution === index && (
                <div className="mt-4 space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
                  {/* Current Pain Points */}
                  <div>
                    <p className="text-xs font-semibold text-red-400 uppercase tracking-wider mb-2">
                      Problemi tipici:
                    </p>
                    <ul className="space-y-1">
                      {sol.painPoints.map((pain, i) => (
                        <li key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
                          <X className="h-3 w-3 text-red-400 shrink-0" />
                          {pain}
                        </li>
                      ))}
                    </ul>
                  </div>
                  
                  {/* Recommendation */}
                  <div className={`p-3 rounded-lg ${
                    sol.upgrade 
                      ? 'bg-emerald-500/10 border border-emerald-500/20' 
                      : 'bg-amber-500/10 border border-amber-500/20'
                  }`}>
                    <div className="flex items-start gap-2">
                      <ArrowRight className={`h-4 w-4 mt-0.5 shrink-0 ${
                        sol.upgrade ? 'text-emerald-400' : 'text-amber-400'
                      }`} />
                      <div>
                        <p className={`text-xs font-semibold uppercase tracking-wider mb-1 ${
                          sol.upgrade ? 'text-emerald-400' : 'text-amber-400'
                        }`}>
                          {sol.upgrade ? '✓ Upgrade consigliato' : '⚠️ Valuta attentamente'}
                        </p>
                        <p className={`text-sm ${
                          sol.upgrade ? 'text-emerald-100' : 'text-amber-100'
                        }`}>
                          {sol.reason}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </button>
          ))}
        </div>
        
        {/* Not Listed Option */}
        <p className="text-xs text-muted-foreground mt-4 text-center">
          La tua situazione non è elencata?{' '}
          <a href="/contatti" className="text-primary hover:underline">
            Contattaci
          </a>
          {' '}per una consulenza personalizzata.
        </p>
      </div>
    </div>
  );
}
