'use client';

import { CheckCircle, AlertTriangle, ThumbsUp, ThumbsDown, Sparkles } from 'lucide-react';

interface ProsConsSectionProps {
  pros: string[] | null;
  cons: string[] | null;
  isAiEnriched: boolean;
}

/**
 * ProsConsSection Component
 * 
 * Displays AI-generated pros and cons for a product.
 * Shows a badge indicating AI-enriched content.
 * Falls back gracefully when no data is available.
 */
export function ProsConsSection({ pros, cons, isAiEnriched }: ProsConsSectionProps) {
  // Don't render if no data available
  if (!pros?.length && !cons?.length) {
    return null;
  }

  return (
    <div className="mt-8 border border-border rounded-xl overflow-hidden bg-card">
      {/* Header with AI Badge */}
      <div className="bg-muted/50 px-6 py-4 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
              <ThumbsUp className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-lg">Pro e Contro</h3>
              <p className="text-sm text-muted-foreground">Analisi onesta del prodotto</p>
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
        {/* Pro & Contro Grid */}
        <div className="grid md:grid-cols-2 gap-6">
          {/* Pros */}
          {pros && pros.length > 0 && (
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
          )}

          {/* Cons */}
          {cons && cons.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <ThumbsDown className="h-5 w-5 text-amber-400" />
                <h4 className="font-semibold text-amber-400">Cosa Considerare</h4>
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
          )}
        </div>

        {/* TAYA Disclaimer */}
        <p className="text-xs text-muted-foreground mt-6 pt-4 border-t border-border">
          💡 <strong>La nostra filosofia:</strong> Preferiamo perderti come cliente oggi piuttosto che venderti qualcosa di sbagliato. 
          Se hai dubbi, <a href="/contatti" className="text-primary hover:underline">contattaci</a> per una consulenza gratuita.
        </p>
      </div>
    </div>
  );
}
