'use client';

import { useState } from 'react';
import { Mail, Gift, CheckCircle } from 'lucide-react';

export function NewsletterSection() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log('Newsletter signup:', email);
    setSubmitted(true);
  };

  return (
    <section className="container px-4 md:px-8 py-12">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-primary to-blue-600 p-8 md:p-12">
        {/* Background pattern */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute inset-0" style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          }} />
        </div>
        
        <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-8">
          {/* Left content */}
          <div className="text-white text-center md:text-left max-w-xl">
            <div className="inline-flex items-center gap-2 mb-4">
              <Gift className="h-6 w-6" />
              <span className="text-sm font-semibold uppercase tracking-wider">Offerta Esclusiva</span>
            </div>
            <h2 className="text-2xl md:text-3xl font-bold mb-3 font-heading">
              Ricevi il 10% di Sconto sul Primo Ordine
            </h2>
            <p className="text-white/80 text-sm md:text-base">
              Iscriviti alla newsletter per ricevere offerte esclusive, novità di prodotto e consigli tecnici dai nostri esperti.
            </p>
          </div>
          
          {/* Right form */}
          <div className="w-full md:w-auto">
            {!submitted ? (
              <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                  <input
                    type="email"
                    placeholder="La tua email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="w-full sm:w-72 h-12 pl-10 pr-4 rounded-lg bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-white/50"
                  />
                </div>
                <button
                  type="submit"
                  className="h-12 px-6 bg-slate-900 text-white rounded-lg font-semibold hover:bg-slate-800 transition-colors whitespace-nowrap"
                >
                  ISCRIVITI ORA
                </button>
              </form>
            ) : (
              <div className="flex items-center gap-3 text-white bg-white/20 rounded-lg px-6 py-4 backdrop-blur-sm">
                <CheckCircle className="h-6 w-6 text-green-300" />
                <span className="font-medium">Grazie! Controlla la tua email.</span>
              </div>
            )}
            <p className="text-white/60 text-xs mt-3 text-center md:text-left">
              Niente spam, cancellati quando vuoi.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
