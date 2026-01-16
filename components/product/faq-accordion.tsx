'use client';

import { useState } from 'react';
import { ChevronDown, HelpCircle, Sparkles } from 'lucide-react';
import { FAQ } from '@/lib/shopify/types';

interface FAQAccordionProps {
  faqs: FAQ[] | null;
  productTitle: string;
  isAiEnriched: boolean;
}

/**
 * FAQAccordion Component
 * 
 * Displays AI-generated FAQs in an accordion format.
 * Includes Schema.org FAQPage markup for SEO.
 * Falls back gracefully when no data is available.
 * 
 * GAP 7: Improved Mobile UX
 * - Larger tap targets (min 44px)
 * - Better touch feedback
 * - Smooth animations
 */
export function FAQAccordion({ faqs, productTitle, isAiEnriched }: FAQAccordionProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  // Don't render if no FAQs available
  if (!faqs?.length) {
    return null;
  }

  // Generate FAQ Schema markup
  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.answer,
      },
    })),
  };

  const toggleFaq = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <>
      {/* FAQ Schema Markup */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />

      <div className="mt-8 border border-border rounded-xl overflow-hidden bg-card">
        {/* Header with AI Badge */}
        <div className="bg-muted/50 px-4 sm:px-6 py-4 border-b border-border">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                <HelpCircle className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0">
                <h3 className="font-semibold text-lg">Domande Frequenti</h3>
                <p className="text-sm text-muted-foreground truncate">Le risposte che cerchi su {productTitle}</p>
              </div>
            </div>
            {isAiEnriched && (
              <div className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-full bg-violet-500/10 border border-violet-500/20 shrink-0">
                <Sparkles className="h-3.5 w-3.5 text-violet-400" />
                <span className="text-xs font-medium text-violet-400 hidden sm:inline">AI-Enhanced</span>
              </div>
            )}
          </div>
        </div>

        {/* FAQ Items - GAP 7: Mobile-optimized */}
        <div className="divide-y divide-border">
          {faqs.map((faq, index) => (
            <div key={index} className="group">
              {/* GAP 7: Larger tap target (min-h-[56px]) for mobile */}
              <button
                onClick={() => toggleFaq(index)}
                className="w-full min-h-[56px] px-4 sm:px-6 py-4 flex items-center justify-between text-left 
                           hover:bg-muted/30 active:bg-muted/50 transition-colors
                           focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset"
                aria-expanded={openIndex === index}
              >
                <span className="font-medium text-foreground pr-4 text-sm sm:text-base">{faq.question}</span>
                <div className="w-10 h-10 flex items-center justify-center shrink-0 -mr-2">
                  <ChevronDown
                    className={`h-5 w-5 text-muted-foreground transition-transform duration-300 ease-out ${
                      openIndex === index ? 'rotate-180' : ''
                    }`}
                  />
                </div>
              </button>
              {/* GAP 7: Smooth height animation */}
              <div
                className={`grid transition-all duration-300 ease-out ${
                  openIndex === index ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
                }`}
              >
                <div className="overflow-hidden">
                  <div className="px-4 sm:px-6 pb-4 text-sm text-muted-foreground leading-relaxed">
                    {faq.answer}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* CTA for more questions - GAP 7: Larger tap target */}
        <div className="px-4 sm:px-6 py-4 bg-muted/30 border-t border-border">
          <p className="text-sm text-muted-foreground">
            Hai altre domande?{' '}
            <a 
              href="/contatti" 
              className="text-primary hover:underline font-medium 
                         inline-flex items-center min-h-[44px] -my-2 py-2"
            >
              Contattaci
            </a>
            {' '}— siamo qui per aiutarti.
          </p>
        </div>
      </div>
    </>
  );
}
