'use client';

import { Lightbulb, ArrowRight } from 'lucide-react';
import { Product } from '@/lib/shopify/types';
import { getBrandName } from '@/lib/utils';

interface JobStoryProps {
  product: Product;
}

/**
 * GAP 11: Job Stories Format
 * Format: "When [situation], I want to [motivation], so I can [expected outcome]"
 * Based on JTBD methodology from Christensen
 */
function generateJobStories(product: Product): { situation: string; motivation: string; outcome: string }[] {
  const title = product.title.toLowerCase();
  const brandName = getBrandName(product.vendor);
  const price = parseFloat(product.priceRange.minVariantPrice.amount);
  
  const stories: { situation: string; motivation: string; outcome: string }[] = [];
  
  // Generate job stories based on product type
  if (title.includes('trapano') || title.includes('drill')) {
    stories.push({
      situation: 'sono in cantiere e devo installare un quadro elettrico',
      motivation: 'forare rapidamente senza cambiare utensile',
      outcome: 'finire il lavoro prima e passare al prossimo cliente'
    });
    stories.push({
      situation: 'lavoro in un controsoffitto stretto',
      motivation: 'avere un trapano compatto che entra ovunque',
      outcome: 'non dover smontare pannelli per accedere ai punti difficili'
    });
  }
  
  if (title.includes('avvitatore') && title.includes('impulsi')) {
    stories.push({
      situation: 'devo svitare bulloni arrugginiti su un\'auto',
      motivation: 'avere abbastanza coppia senza sforzo fisico',
      outcome: 'non rovinarmi il polso e finire più lavori al giorno'
    });
    stories.push({
      situation: 'cambio gomme tutto il giorno',
      motivation: 'avere un utensile che non si surriscalda',
      outcome: 'lavorare senza interruzioni e servire più clienti'
    });
  }
  
  if (title.includes('tassellatore') || title.includes('sds')) {
    stories.push({
      situation: 'devo forare cemento armato per passare cavi',
      motivation: 'avere potenza sufficiente senza fermarmi',
      outcome: 'completare l\'impianto nei tempi previsti'
    });
    stories.push({
      situation: 'lavoro su un ponteggio',
      motivation: 'avere un utensile leggero ma potente',
      outcome: 'non affaticarmi e lavorare in sicurezza'
    });
  }
  
  if (title.includes('smerigliatrice') || title.includes('grinder')) {
    stories.push({
      situation: 'devo preparare superfici per la saldatura',
      motivation: 'smerigliare velocemente senza vibrazioni eccessive',
      outcome: 'avere giunti puliti e saldature di qualità'
    });
    stories.push({
      situation: 'taglio tubi metallici in cantiere',
      motivation: 'avere un disco che dura e taglia dritto',
      outcome: 'non sprecare tempo a rifinire i tagli'
    });
  }
  
  if (title.includes('batteria') || title.includes('battery')) {
    stories.push({
      situation: 'sono a metà giornata e la batteria si scarica',
      motivation: 'avere batterie che durano tutto il giorno',
      outcome: 'non dover tornare al furgone ogni due ore'
    });
    stories.push({
      situation: 'fa freddo e le batterie si scaricano velocemente',
      motivation: 'avere batterie che funzionano anche sotto zero',
      outcome: 'lavorare anche d\'inverno senza problemi'
    });
  }
  
  // Generic stories if no specific match
  if (stories.length === 0) {
    stories.push({
      situation: 'ho un lavoro da completare in tempi stretti',
      motivation: 'avere l\'utensile giusto che non mi rallenta',
      outcome: 'consegnare in tempo e soddisfare il cliente'
    });
    stories.push({
      situation: 'devo investire in nuova attrezzatura',
      motivation: 'scegliere qualcosa che duri nel tempo',
      outcome: 'non dover ricomprare tra un anno'
    });
  }
  
  return stories;
}

export function JobStory({ product }: JobStoryProps) {
  const stories = generateJobStories(product);
  
  return (
    <div className="mt-6 p-5 bg-gradient-to-br from-cyan-500/10 via-cyan-500/5 to-transparent border border-cyan-500/20 rounded-xl">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <Lightbulb className="h-5 w-5 text-cyan-400" />
        <h4 className="font-semibold text-cyan-400">Quando Ti Serve?</h4>
        <span className="text-xs text-muted-foreground ml-auto">Job Stories</span>
      </div>
      
      <p className="text-xs text-muted-foreground mb-4">
        Ecco le situazioni reali in cui questo prodotto fa la differenza:
      </p>
      
      {/* Job Stories */}
      <div className="space-y-4">
        {stories.map((story, index) => (
          <div key={index} className="p-4 bg-background/50 rounded-lg border border-border/50">
            <div className="flex flex-col gap-2">
              {/* Situation */}
              <div className="flex items-start gap-2">
                <span className="text-xs font-semibold text-cyan-400 uppercase tracking-wider shrink-0 mt-0.5">
                  Quando
                </span>
                <span className="text-sm text-foreground">{story.situation}</span>
              </div>
              
              {/* Arrow */}
              <div className="flex items-center gap-2 pl-4">
                <ArrowRight className="h-3 w-3 text-muted-foreground" />
              </div>
              
              {/* Motivation */}
              <div className="flex items-start gap-2">
                <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider shrink-0 mt-0.5">
                  Voglio
                </span>
                <span className="text-sm text-foreground">{story.motivation}</span>
              </div>
              
              {/* Arrow */}
              <div className="flex items-center gap-2 pl-4">
                <ArrowRight className="h-3 w-3 text-muted-foreground" />
              </div>
              
              {/* Outcome */}
              <div className="flex items-start gap-2">
                <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider shrink-0 mt-0.5">
                  Così
                </span>
                <span className="text-sm text-foreground">{story.outcome}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
