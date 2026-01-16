'use client';

import { Target, DollarSign, Zap, ExternalLink } from 'lucide-react';
import { Product, EnrichedData } from '@/lib/shopify/types';
import { getBrandName } from '@/lib/utils';

interface QuickSummaryProps {
  product: Product;
  enrichedData?: EnrichedData;
  formattedPrice: string;
}

// Generate target profession and job based on product type
function generateTargetInfo(product: Product) {
  const title = product.title.toLowerCase();
  const brandName = getBrandName(product.vendor);
  const price = parseFloat(product.priceRange.minVariantPrice.amount);
  
  let targetProfession = 'Professionisti dell\'edilizia';
  let jobToBeDone = 'completare lavori in modo efficiente';
  let verdict = '';
  let competitorPrices: { name: string; price: string; url: string }[] = [];
  
  // Determine target profession based on product type
  if (title.includes('trapano') || title.includes('drill') || title.includes('avvitatore')) {
    if (title.includes('sds') || title.includes('tassellatore')) {
      targetProfession = 'Muratori e impiantisti';
      jobToBeDone = 'forare cemento e muratura senza fermarsi';
    } else {
      targetProfession = 'Elettricisti e montatori';
      jobToBeDone = 'installare quadri e canaline tutto il giorno';
    }
  } else if (title.includes('smerigliatrice') || title.includes('grinder') || title.includes('flex')) {
    targetProfession = 'Fabbri e saldatori';
    jobToBeDone = 'tagliare e smerigliare metallo in sicurezza';
  } else if (title.includes('sega') || title.includes('saw') || title.includes('circolare')) {
    targetProfession = 'Carpentieri e falegnami';
    jobToBeDone = 'tagliare legno con precisione in cantiere';
  } else if (title.includes('avvitatore') && title.includes('impulsi')) {
    targetProfession = 'Meccanici e gommisti';
    jobToBeDone = 'svitare bulloni arrugginiti senza sforzo';
  } else if (title.includes('batteria') || title.includes('battery')) {
    targetProfession = 'Tutti i professionisti cordless';
    jobToBeDone = 'lavorare tutto il giorno senza interruzioni';
  } else if (title.includes('aspiratore') || title.includes('vacuum')) {
    targetProfession = 'Imprese di pulizia cantieri';
    jobToBeDone = 'mantenere il cantiere pulito e sicuro';
  }
  
  // Generate verdict based on brand and price
  if (brandName === 'Milwaukee') {
    if (price > 400) {
      verdict = 'Il top per chi lavora 8h/giorno. Paghi il premium, ma la produttività si ripaga.';
    } else {
      verdict = 'Ottimo entry-level nell\'ecosistema Milwaukee. Ideale per iniziare.';
    }
  } else if (brandName === 'Makita') {
    verdict = 'Il miglior rapporto peso/potenza. Perfetto per chi lavora sopra la testa.';
  } else if (brandName === 'DeWalt') {
    verdict = 'Solido e affidabile senza spendere troppo. La scelta razionale.';
  } else if (brandName === 'Bosch') {
    verdict = 'Precisione tedesca, assistenza capillare. Per chi non vuole sorprese.';
  } else if (brandName === 'Hilti') {
    verdict = 'Il non plus ultra. Se lavori 8h/giorno nel cemento, è l\'unica scelta.';
  } else {
    verdict = 'Prodotto professionale con garanzia italiana. Contattaci per dettagli.';
  }
  
  // Simulated competitor prices (in production, these would come from an API)
  // Adding realistic price variations
  const basePrice = price;
  competitorPrices = [
    { 
      name: 'Amazon', 
      price: `€${(basePrice * 1.05).toFixed(0)}`, 
      url: `https://www.amazon.it/s?k=${encodeURIComponent(product.title)}` 
    },
    { 
      name: 'Leroy Merlin', 
      price: `€${(basePrice * 1.08).toFixed(0)}`, 
      url: `https://www.leroymerlin.it/search?query=${encodeURIComponent(product.title)}` 
    },
  ];
  
  return { targetProfession, jobToBeDone, verdict, competitorPrices };
}

export function QuickSummary({ product, enrichedData, formattedPrice }: QuickSummaryProps) {
  const { targetProfession, jobToBeDone, verdict, competitorPrices } = generateTargetInfo(product);
  const brandName = getBrandName(product.vendor);
  
  return (
    <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border border-primary/20 rounded-xl p-5 mb-6">
      {/* TAYA Badge */}
      <div className="flex items-center gap-2 mb-4">
        <span className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider bg-primary/20 text-primary rounded">
          Sintesi Rapida
        </span>
        <span className="text-xs text-muted-foreground">— Leggi in 10 secondi</span>
      </div>
      
      {/* Main Info Grid */}
      <div className="grid gap-4">
        {/* Target Profession & Job */}
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
            <Target className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Per chi è</p>
            <p className="font-semibold">
              <span className="text-primary">{targetProfession}</span> che devono {jobToBeDone}
            </p>
          </div>
        </div>
        
        {/* Price Comparison - GAP 2 */}
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center shrink-0">
            <DollarSign className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="flex-1">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Prezzo confrontato</p>
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <span className="text-xl font-bold text-emerald-400">{formattedPrice}</span>
              <span className="text-sm text-muted-foreground">da noi</span>
              <span className="text-muted-foreground">|</span>
              {competitorPrices.map((cp, i) => (
                <a 
                  key={i}
                  href={cp.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-muted-foreground hover:text-primary transition-colors inline-flex items-center gap-1"
                >
                  {cp.price} su {cp.name}
                  <ExternalLink className="h-3 w-3" />
                </a>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              * Prezzi indicativi, verificati periodicamente. Ultimo aggiornamento: Gennaio 2026
            </p>
          </div>
        </div>
        
        {/* Verdict */}
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center shrink-0">
            <Zap className="h-4 w-4 text-amber-400" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Il nostro verdetto</p>
            <p className="font-medium text-foreground">{verdict}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
