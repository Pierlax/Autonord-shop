import Image from 'next/image';
import Link from 'next/link';
import { Phone, MessageCircle, Award, Clock } from 'lucide-react';

export function TeamTrust() {
  return (
    <section className="py-16 bg-gradient-to-br from-zinc-900 via-zinc-900 to-zinc-800">
      <div className="container max-w-screen-xl px-4">
        <div className="grid md:grid-cols-2 gap-8 items-center">
          {/* Team Photo Side */}
          <div className="relative">
            <div className="aspect-[4/3] relative rounded-2xl overflow-hidden shadow-2xl">
              {/* Placeholder team image - in production would be a real photo */}
              <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-zinc-800 flex items-center justify-center">
                <div className="text-center">
                  <div className="w-32 h-32 mx-auto mb-4 rounded-full bg-zinc-700 flex items-center justify-center border-4 border-primary/30">
                    <span className="text-4xl font-bold text-primary">AS</span>
                  </div>
                  <p className="text-zinc-400 text-sm">Il Team Autonord Service</p>
                </div>
              </div>
            </div>
            
            {/* Experience Badge */}
            <div className="absolute -bottom-4 -right-4 bg-primary text-primary-foreground px-6 py-3 rounded-xl shadow-lg">
              <div className="flex items-center gap-2">
                <Award className="h-5 w-5" />
                <span className="font-bold">18+ Anni di Esperienza</span>
              </div>
            </div>
          </div>

          {/* Content Side */}
          <div className="space-y-6">
            <div>
              <span className="text-primary text-sm font-semibold tracking-wider uppercase">Assistenza Diretta</span>
              <h2 className="text-3xl md:text-4xl font-bold text-white mt-2">
                Parla con un Tecnico,<br />
                <span className="text-primary">Non con un Call Center</span>
              </h2>
            </div>

            <p className="text-zinc-400 text-lg leading-relaxed">
              Quando chiami Autonord Service, rispondiamo noi. Tecnici specializzati con esperienza 
              reale in cantiere, non operatori che leggono da un copione. Ti aiutiamo a scegliere 
              l'attrezzo giusto per il tuo lavoro.
            </p>

            {/* Team Member Highlight */}
            <div className="bg-zinc-800/50 rounded-xl p-6 border border-zinc-700">
              <div className="flex items-start gap-4">
                <div className="w-16 h-16 rounded-full bg-zinc-700 flex items-center justify-center flex-shrink-0 border-2 border-primary/30">
                  <span className="text-xl font-bold text-primary">MC</span>
                </div>
                <div>
                  <h3 className="text-white font-semibold text-lg">Marco - Responsabile Tecnico</h3>
                  <p className="text-zinc-400 text-sm mt-1">
                    "Dopo 15 anni nel settore, conosco ogni attrezzo che vendiamo. 
                    Se non è adatto a te, te lo dico."
                  </p>
                  <div className="flex items-center gap-4 mt-3">
                    <span className="text-xs text-zinc-500 flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      Risposta media: 2 ore
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Contact CTAs */}
            <div className="flex flex-col sm:flex-row gap-4">
              <Link 
                href="tel:0107456076"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-lg font-semibold hover:bg-primary/90 transition-colors"
              >
                <Phone className="h-5 w-5" />
                Chiama Ora: 010 7456076
              </Link>
              <Link 
                href="https://wa.me/393331234567"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 transition-colors"
              >
                <MessageCircle className="h-5 w-5" />
                Scrivici su WhatsApp
              </Link>
            </div>

            {/* Trust Points */}
            <div className="grid grid-cols-3 gap-4 pt-4 border-t border-zinc-700">
              <div className="text-center">
                <div className="text-2xl font-bold text-primary">2006</div>
                <div className="text-xs text-zinc-500">Anno Fondazione</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-primary">5000+</div>
                <div className="text-xs text-zinc-500">Clienti Serviti</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-primary">98%</div>
                <div className="text-xs text-zinc-500">Soddisfazione</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
