'use client';

import { ArrowRight, ArrowLeft, AlertCircle, Repeat } from 'lucide-react';
import { Product } from '@/lib/shopify/types';
import { getBrandName } from '@/lib/utils';

interface FourForcesProps {
  product: Product;
}

// Generate the 4 Forces of Progress based on product
function generateFourForces(product: Product) {
  const title = product.title.toLowerCase();
  const brandName = getBrandName(product.vendor);
  const price = parseFloat(product.priceRange.minVariantPrice.amount);
  
  let push = ''; // Frustration with current situation
  let pull = ''; // Attraction to new solution
  let anxiety = ''; // Fear of change
  let habit = ''; // Comfort with current behavior
  
  // Push - What's frustrating about the current situation?
  if (title.includes('trapano') || title.includes('drill')) {
    push = 'Il tuo trapano attuale si ferma nel cemento? La batteria dura mezza giornata?';
  } else if (title.includes('avvitatore') && title.includes('impulsi')) {
    push = 'Stanco di usare la chiave a croce sui bulloni arrugginiti? Ti fa male il polso?';
  } else if (title.includes('smerigliatrice') || title.includes('grinder')) {
    push = 'La tua smerigliatrice vibra troppo? Si surriscalda dopo 10 minuti?';
  } else if (title.includes('sega') || title.includes('saw')) {
    push = 'I tuoi tagli non sono mai dritti? Devi sempre rifinire a mano?';
  } else if (title.includes('batteria') || title.includes('battery')) {
    push = 'Devi portare 4 batterie per arrivare a fine giornata? Pesano troppo?';
  } else {
    push = 'Il tuo utensile attuale ti rallenta? Ti costringe a compromessi?';
  }
  
  // Pull - What's attractive about this solution?
  if (brandName === 'Milwaukee') {
    pull = 'Ecosistema M18 con 200+ utensili, batterie che durano tutto il giorno, garanzia 5 anni';
  } else if (brandName === 'Makita') {
    pull = 'Il più leggero della categoria, perfetto per lavori sopra la testa, prezzo accessibile';
  } else if (brandName === 'DeWalt') {
    pull = 'Affidabilità comprovata, ricambi ovunque, ottimo rapporto qualità/prezzo';
  } else if (brandName === 'Bosch') {
    pull = 'Precisione tedesca, assistenza capillare in Italia, durata nel tempo';
  } else if (brandName === 'Hilti') {
    pull = 'Prestazioni imbattibili, assistenza Fleet Management, costruito per durare';
  } else {
    pull = 'Qualità professionale, garanzia italiana, assistenza dedicata';
  }
  
  // Anxiety - What fears might prevent the switch?
  const anxieties = [];
  if (price > 400) {
    anxieties.push(`"Costa €${price.toFixed(0)}, e se non vale la pena?"`);
  }
  anxieties.push('"E se non è compatibile con le mie batterie?"');
  anxieties.push('"Dovrò imparare a usarlo da zero?"');
  
  anxiety = anxieties.join(' ');
  
  // Habit - What keeps people with current solution?
  habit = 'Hai già batterie di un altro brand? Conosci a memoria il tuo vecchio utensile? È normale esitare.';
  
  // Generate reassurances
  const reassurances = [];
  if (brandName === 'Milwaukee' || brandName === 'Makita' || brandName === 'DeWalt') {
    reassurances.push('✓ Funziona esattamente come ti aspetti — nessuna curva di apprendimento');
  }
  reassurances.push('✓ 30 giorni per provarlo — se non ti convince, lo ritiri');
  reassurances.push('✓ Assistenza telefonica gratuita per qualsiasi dubbio');
  
  return { push, pull, anxiety, habit, reassurances };
}

export function FourForces({ product }: FourForcesProps) {
  const { push, pull, anxiety, habit, reassurances } = generateFourForces(product);
  
  return (
    <div className="mt-6 border border-border rounded-xl overflow-hidden">
      {/* Header */}
      <div className="bg-muted/50 px-5 py-3 border-b border-border">
        <h4 className="font-semibold text-sm flex items-center gap-2">
          <span className="text-lg">⚖️</span>
          Le 4 Forze della Decisione
        </h4>
        <p className="text-xs text-muted-foreground mt-1">
          Cosa ti spinge verso il nuovo e cosa ti trattiene? Ecco l'analisi onesta.
        </p>
      </div>
      
      <div className="p-5">
        {/* Forces Grid */}
        <div className="grid md:grid-cols-2 gap-4 mb-6">
          {/* Push - Frustration */}
          <div className="p-4 bg-red-500/10 rounded-lg border border-red-500/20">
            <div className="flex items-center gap-2 mb-2">
              <ArrowRight className="h-4 w-4 text-red-400" />
              <span className="text-xs font-semibold text-red-400 uppercase tracking-wider">
                Push — Frustrazione Attuale
              </span>
            </div>
            <p className="text-sm text-red-100">{push}</p>
          </div>
          
          {/* Pull - Attraction */}
          <div className="p-4 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
            <div className="flex items-center gap-2 mb-2">
              <ArrowLeft className="h-4 w-4 text-emerald-400" />
              <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">
                Pull — Attrazione Nuova
              </span>
            </div>
            <p className="text-sm text-emerald-100">{pull}</p>
          </div>
          
          {/* Anxiety */}
          <div className="p-4 bg-amber-500/10 rounded-lg border border-amber-500/20">
            <div className="flex items-center gap-2 mb-2">
              <AlertCircle className="h-4 w-4 text-amber-400" />
              <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider">
                Ansia — Paure Legittime
              </span>
            </div>
            <p className="text-sm text-amber-100">{anxiety}</p>
          </div>
          
          {/* Habit */}
          <div className="p-4 bg-blue-500/10 rounded-lg border border-blue-500/20">
            <div className="flex items-center gap-2 mb-2">
              <Repeat className="h-4 w-4 text-blue-400" />
              <span className="text-xs font-semibold text-blue-400 uppercase tracking-wider">
                Abitudine — Comfort Zone
              </span>
            </div>
            <p className="text-sm text-blue-100">{habit}</p>
          </div>
        </div>
        
        {/* Reassurances */}
        <div className="p-4 bg-primary/10 rounded-lg border border-primary/20">
          <p className="text-xs font-semibold text-primary uppercase tracking-wider mb-2">
            🛡️ Come Riduciamo le Tue Ansie
          </p>
          <ul className="space-y-1">
            {reassurances.map((r, i) => (
              <li key={i} className="text-sm text-primary/90">{r}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
