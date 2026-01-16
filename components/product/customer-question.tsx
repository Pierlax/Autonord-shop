'use client';

import { useState } from 'react';
import { MessageCircleQuestion, Send, CheckCircle } from 'lucide-react';

interface CustomerQuestionProps {
  productTitle: string;
  productHandle: string;
}

export function CustomerQuestion({ productTitle, productHandle }: CustomerQuestionProps) {
  const [question, setQuestion] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim()) return;
    
    setIsSubmitting(true);
    
    // In production, this would send to an API endpoint
    // For now, we'll simulate a submission
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // In production:
      // await fetch('/api/questions', {
      //   method: 'POST',
      //   body: JSON.stringify({ question, productTitle, productHandle }),
      // });
      
      setIsSubmitted(true);
      setQuestion('');
    } catch (error) {
      console.error('Error submitting question:', error);
    } finally {
      setIsSubmitting(false);
    }
  };
  
  if (isSubmitted) {
    return (
      <div className="mt-6 p-5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
            <CheckCircle className="h-5 w-5 text-emerald-400" />
          </div>
          <div>
            <p className="font-semibold text-emerald-400">Grazie per la tua domanda!</p>
            <p className="text-sm text-emerald-100/80">
              Ti risponderemo entro 24 ore via email. La tua domanda ci aiuta a migliorare le nostre schede prodotto.
            </p>
          </div>
        </div>
      </div>
    );
  }
  
  return (
    <div className="mt-6 border border-border rounded-xl overflow-hidden">
      {/* Header */}
      <div className="bg-muted/50 px-5 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <MessageCircleQuestion className="h-5 w-5 text-primary" />
          <h4 className="font-semibold">Hai una domanda su questo prodotto?</h4>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Chiedici qualsiasi cosa — rispondiamo entro 24 ore e aggiungiamo le risposte alla scheda.
        </p>
      </div>
      
      <form onSubmit={handleSubmit} className="p-5">
        <div className="space-y-3">
          {/* Common Questions Suggestions */}
          <div className="flex flex-wrap gap-2">
            <span className="text-xs text-muted-foreground">Domande frequenti:</span>
            {[
              'È compatibile con le mie batterie?',
              'Quanto pesa con la batteria?',
              'Che garanzia ha?',
            ].map((q, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setQuestion(q)}
                className="text-xs px-2 py-1 rounded-full bg-muted hover:bg-muted/80 transition-colors"
              >
                {q}
              </button>
            ))}
          </div>
          
          {/* Question Input */}
          <div className="relative">
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder={`Scrivi la tua domanda su ${productTitle}...`}
              className="w-full min-h-[100px] p-3 pr-12 rounded-lg border border-border bg-background text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/50"
              maxLength={500}
            />
            <div className="absolute bottom-3 right-3 text-xs text-muted-foreground">
              {question.length}/500
            </div>
          </div>
          
          {/* Submit Button */}
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              💡 Le domande più utili vengono aggiunte alle FAQ del prodotto
            </p>
            <button
              type="submit"
              disabled={!question.trim() || isSubmitting}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isSubmitting ? (
                <>
                  <span className="animate-spin">⏳</span>
                  Invio...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  Invia Domanda
                </>
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
