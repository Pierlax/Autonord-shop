'use client';

import { CheckCircle, AlertTriangle, Info, User, ThumbsUp, ThumbsDown, Sparkles } from 'lucide-react';
import { Product, EnrichedData } from '@/lib/shopify/types';
import { getBrandName } from '@/lib/utils';

interface ExpertReviewProps {
  product: Product;
  enrichedData?: EnrichedData;
}

// Generate honest pros and cons based on product characteristics (fallback)
function generateFallbackReview(product: Product) {
  const brandName = getBrandName(product.vendor);
  const title = product.title.toLowerCase();
  const price = parseFloat(product.priceRange.minVariantPrice.amount);
  
  // Default reviews based on brand and product type
  let pros: string[] = [];
  let cons: string[] = [];
  let idealFor: string[] = [];
  let notIdealFor: string[] = [];
  let expertNote = '';
  
  // Brand-specific characteristics
  if (brandName === 'Milwaukee') {
    pros.push('Ecosistema M18/M12 con oltre 200 utensili compatibili');
    pros.push('Batterie High Output con durata superiore alla media');
    pros.push('Garanzia 5 anni sui prodotti FUEL');
    cons.push('Prezzo premium rispetto alla concorrenza');
    if (price > 300) {
      cons.push('Investimento importante - valuta se lo userai abbastanza');
    }
    expertNote = 'Milwaukee è la scelta preferita da elettricisti e idraulici per la gamma di utensili specializzati.';
  } else if (brandName === 'Makita') {
    pros.push('Miglior rapporto peso/potenza della categoria');
    pros.push('Controllo del grilletto più preciso per lavori di finitura');
    pros.push('Prezzo più accessibile a parità di prestazioni');
    cons.push('Ecosistema batterie meno esteso di Milwaukee');
    if (title.includes('40v') || title.includes('xgt')) {
      cons.push('Sistema 40V ancora giovane - meno utensili disponibili');
    }
    expertNote = 'Makita eccelle per leggerezza e comfort durante l\'uso prolungato. Ideale per carpentieri.';
  } else if (brandName === 'DeWalt') {
    pros.push('Ottimo rapporto qualità/prezzo');
    pros.push('Ampia disponibilità di ricambi e accessori');
    pros.push('Sistema FlexVolt per utensili pesanti');
    cons.push('Ergonomia inferiore per uso tutto il giorno');
    cons.push('Batterie si scaricano più velocemente in standby');
    expertNote = 'DeWalt è la scelta intelligente per chi cerca prestazioni solide senza spendere troppo.';
  } else if (brandName === 'Bosch') {
    pros.push('Precisione tedesca nella costruzione');
    pros.push('Ottima per lavori di precisione e finitura');
    pros.push('Assistenza capillare in Italia');
    cons.push('Meno potenza bruta rispetto a Milwaukee');
    expertNote = 'Bosch Professional è sinonimo di affidabilità. Ideale per chi cerca un utensile che duri.';
  } else if (brandName === 'Hilti') {
    pros.push('Costruzione robustissima per uso intensivo');
    pros.push('Assistenza Hilti Fleet Management inclusa');
    pros.push('Prestazioni al top assoluto della categoria');
    cons.push('Prezzo significativamente più alto della concorrenza');
    cons.push('Ecosistema chiuso - difficile uscirne');
    expertNote = 'Hilti è per chi non accetta compromessi. Se lavori 8 ore al giorno, l\'investimento si ripaga.';
  } else {
    // Generic
    pros.push('Prodotto di marca affidabile');
    pros.push('Garanzia italiana inclusa');
    cons.push('Verifica la compatibilità con i tuoi accessori esistenti');
    expertNote = 'Contattaci per una consulenza personalizzata su questo prodotto.';
  }
  
  // Product type specific
  if (title.includes('trapano') || title.includes('drill')) {
    idealFor.push('Foratura su legno, metallo e muratura leggera');
    idealFor.push('Lavori di assemblaggio e fissaggio');
    notIdealFor.push('Foratura intensiva su cemento armato (serve tassellatore)');
  } else if (title.includes('tassellatore') || title.includes('rotary hammer') || title.includes('sds')) {
    idealFor.push('Foratura su cemento e muratura');
    idealFor.push('Lavori di demolizione leggera');
    notIdealFor.push('Lavori di precisione su legno (troppa potenza)');
    notIdealFor.push('Uso occasionale hobbistico (sovradimensionato)');
  } else if (title.includes('avvitatore') || title.includes('impact')) {
    idealFor.push('Avvitatura rapida di viti e bulloni');
    idealFor.push('Lavori su strutture metalliche');
    notIdealFor.push('Viti delicate o materiali morbidi (rischio di spanare)');
  } else if (title.includes('smerigliatrice') || title.includes('grinder')) {
    idealFor.push('Taglio e smerigliatura di metalli');
    idealFor.push('Preparazione superfici per saldatura');
    notIdealFor.push('Lavori di finitura fine (serve utensile dedicato)');
  } else if (title.includes('sega') || title.includes('saw')) {
    idealFor.push('Taglio rapido di legno e derivati');
    idealFor.push('Lavori di carpenteria');
    notIdealFor.push('Tagli di precisione per mobili (serve sega da banco)');
  }
  
  // Price-based recommendations
  if (price > 500) {
    idealFor.push('Professionisti che lo usano quotidianamente');
    notIdealFor.push('Hobbisti o uso occasionale (esistono alternative più economiche)');
  } else if (price < 150) {
    idealFor.push('Chi inizia o ha un budget limitato');
    notIdealFor.push('Uso professionale intensivo (considera modelli superiori)');
  }
  
  // Ensure we have at least some recommendations
  if (idealFor.length === 0) {
    idealFor.push('Professionisti del settore edile');
    idealFor.push('Artigiani e manutentori');
  }
  if (notIdealFor.length === 0) {
    notIdealFor.push('Valuta le tue esigenze specifiche prima dell\'acquisto');
  }
  
  return { pros, cons, idealFor, notIdealFor, expertNote };
}

export function ExpertReview({ product, enrichedData }: ExpertReviewProps) {
  // Use AI-enriched data if available, otherwise fall back to rule-based generation
  const isAiEnriched = enrichedData?.isEnriched ?? false;
  
  let pros: string[];
  let cons: string[];
  let idealFor: string[];
  let notIdealFor: string[];
  let expertNote: string;
  
  if (isAiEnriched && enrichedData?.pros && enrichedData?.cons) {
    // Use AI-generated content
    pros = enrichedData.pros;
    cons = enrichedData.cons;
    // For AI content, we generate ideal/notIdeal from the fallback logic
    const fallback = generateFallbackReview(product);
    idealFor = fallback.idealFor;
    notIdealFor = fallback.notIdealFor;
    expertNote = enrichedData.aiDescription || fallback.expertNote;
  } else {
    // Use fallback rule-based generation
    const fallback = generateFallbackReview(product);
    pros = fallback.pros;
    cons = fallback.cons;
    idealFor = fallback.idealFor;
    notIdealFor = fallback.notIdealFor;
    expertNote = fallback.expertNote;
  }
  
  return (
    <div className="mt-8 border border-border rounded-xl overflow-hidden bg-card">
      {/* Header */}
      <div className="bg-muted/50 px-6 py-4 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
              <User className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-lg">Recensione del Tecnico</h3>
              <p className="text-sm text-muted-foreground">Opinione onesta del nostro team — non solo marketing</p>
            </div>
          </div>
          {isAiEnriched && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-violet-500/10 border border-violet-500/20">
              <Sparkles className="h-3.5 w-3.5 text-violet-400" />
              <span className="text-xs font-medium text-violet-400">AI-Enhanced</span>
            </div>
          )}
        </div>
      </div>
      
      <div className="p-6">
        {/* Expert Note */}
        {expertNote && (
          <div className="mb-6 p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
            <div className="flex gap-3">
              <Info className="h-5 w-5 text-blue-400 shrink-0 mt-0.5" />
              <p className="text-sm text-blue-100">{expertNote}</p>
            </div>
          </div>
        )}
        
        {/* Pro & Contro Grid */}
        <div className="grid md:grid-cols-2 gap-6 mb-6">
          {/* Pros */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <ThumbsUp className="h-5 w-5 text-emerald-400" />
              <h4 className="font-semibold text-emerald-400">Perché Comprarlo</h4>
            </div>
            <ul className="space-y-2">
              {pros.map((pro, index) => (
                <li key={index} className="flex items-start gap-2 text-sm">
                  <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                  <span>{pro}</span>
                </li>
              ))}
            </ul>
          </div>
          
          {/* Cons */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <ThumbsDown className="h-5 w-5 text-amber-400" />
              <h4 className="font-semibold text-amber-400">A Chi lo Sconsigliamo</h4>
            </div>
            <ul className="space-y-2">
              {cons.map((con, index) => (
                <li key={index} className="flex items-start gap-2 text-sm">
                  <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                  <span>{con}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
        
        {/* Ideal For / Not Ideal For */}
        <div className="border-t border-border pt-6">
          <h4 className="font-semibold mb-4">Per Chi è Questo Prodotto?</h4>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="p-4 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
              <p className="text-xs font-semibold text-emerald-400 uppercase tracking-wider mb-2">✅ Ideale per:</p>
              <ul className="space-y-1">
                {idealFor.map((item, index) => (
                  <li key={index} className="text-sm text-emerald-100">{item}</li>
                ))}
              </ul>
            </div>
            <div className="p-4 bg-red-500/10 rounded-lg border border-red-500/20">
              <p className="text-xs font-semibold text-red-400 uppercase tracking-wider mb-2">⚠️ Non ideale per:</p>
              <ul className="space-y-1">
                {notIdealFor.map((item, index) => (
                  <li key={index} className="text-sm text-red-100">{item}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
        
        {/* Disclaimer */}
        <p className="text-xs text-muted-foreground mt-6 pt-4 border-t border-border">
          💡 <strong>La nostra filosofia:</strong> Preferiamo perderti come cliente oggi piuttosto che venderti qualcosa di sbagliato. 
          Se hai dubbi, <a href="/contatti" className="text-primary hover:underline">contattaci</a> per una consulenza gratuita.
        </p>
      </div>
    </div>
  );
}
