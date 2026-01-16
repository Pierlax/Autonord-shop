'use client';

import { Wrench, Heart, Users, Lightbulb } from 'lucide-react';
import { Product } from '@/lib/shopify/types';
import { getBrandName } from '@/lib/utils';

interface JTBDDimensionsProps {
  product: Product;
}

// Generate JTBD dimensions based on product characteristics
function generateJTBDDimensions(product: Product) {
  const title = product.title.toLowerCase();
  const brandName = getBrandName(product.vendor);
  const price = parseFloat(product.priceRange.minVariantPrice.amount);
  
  let functional = '';
  let emotional = '';
  let social = '';
  
  // Functional dimension - What task needs to be accomplished?
  if (title.includes('trapano') || title.includes('drill')) {
    if (title.includes('sds') || title.includes('tassellatore')) {
      functional = 'Forare cemento armato e muratura pesante senza interruzioni, completando più lavori al giorno';
    } else {
      functional = 'Forare e avvitare rapidamente su diversi materiali, riducendo i tempi di installazione';
    }
  } else if (title.includes('avvitatore') && title.includes('impulsi')) {
    functional = 'Svitare bulloni bloccati e serrare con coppia elevata senza sforzo fisico';
  } else if (title.includes('smerigliatrice') || title.includes('grinder')) {
    functional = 'Tagliare e smerigliare metallo con precisione, preparando superfici per saldatura';
  } else if (title.includes('sega') || title.includes('saw')) {
    functional = 'Eseguire tagli dritti e precisi su legno e derivati direttamente in cantiere';
  } else if (title.includes('batteria') || title.includes('battery')) {
    functional = 'Alimentare gli utensili per un\'intera giornata di lavoro senza dover ricaricare';
  } else if (title.includes('aspiratore') || title.includes('vacuum')) {
    functional = 'Mantenere l\'area di lavoro pulita e sicura, rispettando le normative';
  } else {
    functional = 'Completare il lavoro in modo efficiente, riducendo tempi e fatica';
  }
  
  // Emotional dimension - How do I want to feel?
  if (brandName === 'Milwaukee' || brandName === 'Hilti') {
    emotional = 'Sentirsi sicuro di avere l\'utensile giusto per qualsiasi situazione, senza compromessi';
  } else if (brandName === 'Makita') {
    emotional = 'Lavorare con comfort e leggerezza, senza affaticarsi anche dopo ore di utilizzo';
  } else if (brandName === 'DeWalt') {
    emotional = 'Avere la tranquillità di un utensile affidabile che non ti lascia a piedi';
  } else if (brandName === 'Bosch') {
    emotional = 'Fidarsi della precisione tedesca, sapendo che ogni lavoro sarà fatto bene';
  } else {
    emotional = 'Sentirsi equipaggiato professionalmente, pronto per qualsiasi sfida';
  }
  
  // Social dimension - How do I want to be perceived?
  if (price > 500) {
    social = 'Essere riconosciuto come il professionista serio che investe negli strumenti giusti';
  } else if (price > 300) {
    social = 'Essere visto come l\'artigiano competente che sa scegliere il rapporto qualità/prezzo';
  } else {
    social = 'Dimostrare di essere un professionista che lavora con attrezzatura adeguata';
  }
  
  // Add brand-specific social perception
  if (brandName === 'Hilti') {
    social = 'Essere identificato come il top del settore, quello che non accetta compromessi';
  } else if (brandName === 'Milwaukee') {
    social = 'Far parte della community di professionisti che scelgono il meglio';
  }
  
  return { functional, emotional, social };
}

export function JTBDDimensions({ product }: JTBDDimensionsProps) {
  const { functional, emotional, social } = generateJTBDDimensions(product);
  
  return (
    <div className="mt-6 p-5 bg-gradient-to-br from-violet-500/10 via-purple-500/5 to-transparent border border-violet-500/20 rounded-xl">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <Lightbulb className="h-5 w-5 text-violet-400" />
        <h4 className="font-semibold text-violet-400">Perché lo "Assumi"?</h4>
        <span className="text-xs text-muted-foreground ml-auto">Jobs To Be Done</span>
      </div>
      
      <p className="text-xs text-muted-foreground mb-4">
        Secondo la teoria di Clayton Christensen, non compri un prodotto — lo "assumi" per fare un lavoro. 
        Ecco i 3 lavori che questo utensile fa per te:
      </p>
      
      {/* Three Dimensions Grid */}
      <div className="grid gap-4">
        {/* Functional */}
        <div className="flex items-start gap-3 p-3 bg-blue-500/10 rounded-lg border border-blue-500/20">
          <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center shrink-0">
            <Wrench className="h-4 w-4 text-blue-400" />
          </div>
          <div>
            <p className="text-xs font-semibold text-blue-400 uppercase tracking-wider mb-1">
              🔧 Job Funzionale
            </p>
            <p className="text-sm text-blue-100">{functional}</p>
          </div>
        </div>
        
        {/* Emotional */}
        <div className="flex items-start gap-3 p-3 bg-rose-500/10 rounded-lg border border-rose-500/20">
          <div className="w-8 h-8 rounded-full bg-rose-500/20 flex items-center justify-center shrink-0">
            <Heart className="h-4 w-4 text-rose-400" />
          </div>
          <div>
            <p className="text-xs font-semibold text-rose-400 uppercase tracking-wider mb-1">
              ❤️ Job Emotivo
            </p>
            <p className="text-sm text-rose-100">{emotional}</p>
          </div>
        </div>
        
        {/* Social */}
        <div className="flex items-start gap-3 p-3 bg-amber-500/10 rounded-lg border border-amber-500/20">
          <div className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center shrink-0">
            <Users className="h-4 w-4 text-amber-400" />
          </div>
          <div>
            <p className="text-xs font-semibold text-amber-400 uppercase tracking-wider mb-1">
              👥 Job Sociale
            </p>
            <p className="text-sm text-amber-100">{social}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
