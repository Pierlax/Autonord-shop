'use client';

import { useState } from 'react';
import { ChevronDown, HelpCircle } from 'lucide-react';

interface FAQ {
  question: string;
  answer: string;
}

interface ProductFAQProps {
  productTitle: string;
  brandName: string;
  category?: string;
}

// Generate dynamic FAQs based on product info
function generateFAQs(productTitle: string, brandName: string): FAQ[] {
  const faqs: FAQ[] = [
    {
      question: `Qual è la garanzia su ${productTitle}?`,
      answer: `Tutti i prodotti ${brandName} venduti da Autonord Service sono coperti da garanzia ufficiale di 24 mesi per uso privato e 12 mesi per uso professionale. Come rivenditore autorizzato, gestiamo direttamente qualsiasi problema in garanzia senza intermediari.`,
    },
    {
      question: `Quali sono i tempi di consegna per questo prodotto?`,
      answer: `Per i prodotti disponibili in magazzino, la spedizione avviene entro 24 ore dall'ordine con consegna in 24-48 ore in tutta Italia. Per i prodotti su ordinazione, i tempi variano da 5 a 7 giorni lavorativi. Riceverai sempre un tracking per seguire la spedizione.`,
    },
    {
      question: `Posso avere assistenza tecnica dopo l'acquisto?`,
      answer: `Assolutamente sì. Autonord Service è centro assistenza autorizzato ${brandName}. Offriamo supporto tecnico telefonico, riparazioni in garanzia e fuori garanzia, e fornitura di ricambi originali. Puoi contattarci al 010 7456076 o via WhatsApp.`,
    },
    {
      question: `È possibile ritirare il prodotto in negozio?`,
      answer: `Sì, offriamo il ritiro gratuito presso la nostra sede di Genova. Puoi selezionare questa opzione durante il checkout. Ti avviseremo via email o SMS quando il prodotto sarà pronto per il ritiro.`,
    },
    {
      question: `Offrite sconti per acquisti multipli o per aziende?`,
      answer: `Sì, offriamo condizioni speciali per professionisti e aziende. Per preventivi personalizzati su acquisti multipli o forniture continuative, contattaci direttamente. Valutiamo ogni richiesta per offrire il miglior prezzo possibile.`,
    },
    {
      question: `Come funziona il reso se il prodotto non mi soddisfa?`,
      answer: `Hai 14 giorni di tempo dalla ricezione per restituire il prodotto se non sei soddisfatto, purché sia integro e nella confezione originale. Il reso è gratuito per difetti o errori di spedizione. Per recessi volontari, le spese di spedizione sono a carico del cliente.`,
    },
  ];

  return faqs;
}

export function ProductFAQ({ productTitle, brandName, category }: ProductFAQProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  const faqs = generateFAQs(productTitle, brandName);

  // Generate JSON-LD Schema for FAQs
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

  return (
    <section className="mt-12 pt-8 border-t border-border">
      {/* Schema Markup */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />

      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
          <HelpCircle className="w-5 h-5 text-primary" />
        </div>
        <h2 className="text-xl font-bold text-foreground">
          Domande Frequenti su Questo Prodotto
        </h2>
      </div>

      <div className="space-y-3">
        {faqs.map((faq, index) => (
          <div
            key={index}
            className="border border-border rounded-xl overflow-hidden bg-card"
          >
            <button
              onClick={() => setOpenIndex(openIndex === index ? null : index)}
              className="w-full flex items-center justify-between p-4 text-left hover:bg-muted/50 transition-colors"
            >
              <span className="font-medium text-foreground pr-4">{faq.question}</span>
              <ChevronDown
                className={`w-5 h-5 text-muted-foreground flex-shrink-0 transition-transform duration-200 ${
                  openIndex === index ? 'rotate-180' : ''
                }`}
              />
            </button>
            <div
              className={`overflow-hidden transition-all duration-200 ${
                openIndex === index ? 'max-h-96' : 'max-h-0'
              }`}
            >
              <div className="p-4 pt-0 text-muted-foreground text-sm leading-relaxed">
                {faq.answer}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* CTA */}
      <div className="mt-6 p-4 bg-muted/30 rounded-xl border border-border/50">
        <p className="text-sm text-muted-foreground mb-3">
          <strong className="text-foreground">Hai altre domande?</strong> Il nostro team è a disposizione per aiutarti.
        </p>
        <div className="flex flex-wrap gap-3">
          <a
            href="https://wa.me/393331234567"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Scrivici su WhatsApp
          </a>
          <a
            href="tel:+390107456076"
            className="inline-flex items-center gap-2 px-4 py-2 bg-zinc-200 hover:bg-zinc-300 text-zinc-800 text-sm font-medium rounded-lg transition-colors"
          >
            Chiamaci: 010 7456076
          </a>
        </div>
      </div>
    </section>
  );
}
