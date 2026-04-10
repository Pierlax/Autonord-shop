import { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { ChevronRight, Award, Users, Truck, Shield, Wrench, Building2, Target, Heart, MapPin, Phone, ExternalLink } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Chi Siamo | Autonord Service',
  description: 'Autonord Service: dal 2006 leader nella vendita e noleggio di elettroutensili professionali, miniescavatori e attrezzature per l\'edilizia a Genova. Concessionario esclusivo Yanmar.',
};

export default function AboutPage() {
  return (
    <div className="flex flex-col">
      {/* Hero Section */}
      <section className="relative w-full py-20 md:py-28 bg-slate-900 overflow-hidden">
        <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1504307651254-35680f356dfd?q=80&w=2070&auto=format&fit=crop')] bg-cover bg-center opacity-20"></div>
        <div className="absolute inset-0 bg-gradient-to-r from-slate-950 via-slate-900/90 to-slate-900/70"></div>
        
        <div className="container relative z-10 px-4 md:px-8">
          {/* Breadcrumbs */}
          <nav className="flex items-center text-sm text-slate-400 mb-8">
            <Link href="/" className="hover:text-primary transition-colors">Home</Link>
            <ChevronRight className="h-4 w-4 mx-2" />
            <span className="text-white">Chi Siamo</span>
          </nav>
          
          <div className="max-w-3xl">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-6 leading-tight">
              La Tua Forza nel <span className="text-primary">Cantiere</span>
            </h1>
            <p className="text-xl text-slate-300 leading-relaxed">
              Dal 2006 siamo il punto di riferimento per i professionisti dell'edilizia a Genova e provincia. 
              Vendita, noleggio e assistenza tecnica di livello superiore.
            </p>
          </div>
        </div>
      </section>

      {/* Exclusive Dealer Banner */}
      <section className="py-6 bg-amber-500/10 border-y border-amber-500/20">
        <div className="container px-4 md:px-8">
          <div className="flex flex-col md:flex-row items-center justify-center gap-4 text-center md:text-left">
            <Award className="h-8 w-8 text-amber-500 shrink-0" />
            <div>
              <p className="text-lg font-bold text-amber-200">Concessionario Esclusivo Yanmar</p>
              <p className="text-sm text-amber-300/80">per la Provincia di Genova — Miniescavatori e macchine movimento terra</p>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-12 bg-secondary/50 border-b border-border/30">
        <div className="container px-4 md:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            <div className="text-center">
              <div className="text-4xl md:text-5xl font-bold text-primary mb-2">18+</div>
              <div className="text-sm text-muted-foreground">Anni di Esperienza</div>
            </div>
            <div className="text-center">
              <div className="text-4xl md:text-5xl font-bold text-primary mb-2">50+</div>
              <div className="text-sm text-muted-foreground">Brand Partner</div>
            </div>
            <div className="text-center">
              <div className="text-4xl md:text-5xl font-bold text-primary mb-2">2000+</div>
              <div className="text-sm text-muted-foreground">Clienti Soddisfatti</div>
            </div>
            <div className="text-center">
              <div className="text-4xl md:text-5xl font-bold text-primary mb-2">8+</div>
              <div className="text-sm text-muted-foreground">Miniescavatori a Noleggio</div>
            </div>
          </div>
        </div>
      </section>

      {/* Story Section - Authentic Description */}
      <section className="py-16 md:py-24">
        <div className="container px-4 md:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            <div>
              <div className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-sm font-medium text-primary mb-6">
                <Building2 className="h-4 w-4 mr-2" />
                La Nostra Storia
              </div>
              <h2 className="text-3xl md:text-4xl font-bold mb-6">
                Una Dinamica Impresa al Servizio dei Professionisti
              </h2>
              <div className="space-y-4 text-muted-foreground leading-relaxed">
                <p>
                  <strong className="text-foreground">Autonord Service</strong> è una dinamica impresa operante dal 2006 
                  su Genova e provincia nel campo del <strong className="text-foreground">noleggio e vendita</strong> di 
                  miniescavatori, camion, furgoni e attrezzature per l'edilizia, compreso l'abbigliamento antinfortunistico.
                </p>
                <p>
                  Con un <strong className="text-foreground">servizio rapido e puntuale</strong> e un'alta disponibilità 
                  di mezzi per il noleggio, Autonord Service è in grado di rispondere rapidamente alle richieste e 
                  necessità dei clienti.
                </p>
                <p>
                  Siamo <strong className="text-foreground">concessionario esclusivo Yanmar</strong> per la provincia di 
                  Genova e partner ufficiale dei migliori brand mondiali come Milwaukee, Makita, Bosch, Festool, 
                  Husqvarna e oltre 50 altri marchi di riferimento nel settore.
                </p>
                <p>
                  La nostra filosofia è basata sulla <strong className="text-foreground">trasparenza totale</strong>: 
                  ti diciamo la verità su prezzi, difetti e disponibilità. Preferiamo perderti come cliente oggi 
                  piuttosto che venderti qualcosa di sbagliato.
                </p>
              </div>
            </div>
            <div className="relative">
              <div className="aspect-[4/3] rounded-2xl overflow-hidden bg-slate-800 border border-slate-700">
                <Image
                  src="/images/yanmar-sv17vt.webp"
                  alt="Miniescavatore Yanmar disponibile a noleggio"
                  fill
                  className="object-contain p-4"
                />
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-slate-900 to-transparent p-4">
                  <p className="text-sm font-semibold text-white">Yanmar SV17VT</p>
                  <p className="text-xs text-slate-400">Disponibile a noleggio</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Values Section */}
      <section className="py-16 md:py-24 bg-secondary/30">
        <div className="container px-4 md:px-8">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <div className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-sm font-medium text-primary mb-6">
              <Heart className="h-4 w-4 mr-2" />
              I Nostri Valori
            </div>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Cosa Ci Rende Diversi
            </h2>
            <p className="text-muted-foreground">
              Non siamo solo un negozio di elettroutensili. Siamo il tuo partner per ogni progetto.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-card border border-border rounded-xl p-6 hover:border-primary/50 transition-colors">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                <Target className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-lg font-bold mb-2">Trasparenza</h3>
              <p className="text-sm text-muted-foreground">
                Ti diciamo la verità su prezzi, difetti e disponibilità. Niente marketing, solo informazioni utili.
              </p>
            </div>

            <div className="bg-card border border-border rounded-xl p-6 hover:border-primary/50 transition-colors">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                <Shield className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-lg font-bold mb-2">Affidabilità</h3>
              <p className="text-sm text-muted-foreground">
                Solo prodotti originali con garanzia ufficiale. Nessun compromesso sulla qualità.
              </p>
            </div>

            <div className="bg-card border border-border rounded-xl p-6 hover:border-primary/50 transition-colors">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                <Wrench className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-lg font-bold mb-2">Assistenza</h3>
              <p className="text-sm text-muted-foreground">
                Centro assistenza autorizzato con riparazioni rapide e ricambi originali sempre disponibili.
              </p>
            </div>

            <div className="bg-card border border-border rounded-xl p-6 hover:border-primary/50 transition-colors">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                <Users className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-lg font-bold mb-2">Relazione</h3>
              <p className="text-sm text-muted-foreground">
                Costruiamo rapporti duraturi con i nostri clienti, basati su fiducia e competenza.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Services Section */}
      <section className="py-16 md:py-24">
        <div className="container px-4 md:px-8">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              I Nostri Servizi
            </h2>
            <p className="text-muted-foreground">
              Un ecosistema completo per supportare ogni fase del tuo lavoro.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="text-center p-8 rounded-2xl bg-gradient-to-b from-primary/5 to-transparent border border-border/50">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6">
                <Truck className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-xl font-bold mb-3">Vendita</h3>
              <p className="text-muted-foreground">
                Elettroutensili professionali, attrezzature per l'edilizia e abbigliamento antinfortunistico. 
                Spedizione in 24/48h in tutta Italia.
              </p>
            </div>

            <div className="text-center p-8 rounded-2xl bg-gradient-to-b from-amber-500/5 to-transparent border border-amber-500/20">
              <div className="w-16 h-16 rounded-full bg-amber-500/10 flex items-center justify-center mx-auto mb-6">
                <Building2 className="h-8 w-8 text-amber-500" />
              </div>
              <h3 className="text-xl font-bold mb-3">Noleggio</h3>
              <p className="text-muted-foreground">
                Flotta di miniescavatori Yanmar, camion, furgoni e attrezzature speciali 
                disponibili per noleggio a breve e lungo termine.
              </p>
              <Link href="/services" className="inline-flex items-center text-sm text-amber-500 hover:underline mt-4">
                Scopri la flotta <ExternalLink className="h-3 w-3 ml-1" />
              </Link>
            </div>

            <div className="text-center p-8 rounded-2xl bg-gradient-to-b from-primary/5 to-transparent border border-border/50">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6">
                <Wrench className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-xl font-bold mb-3">Assistenza</h3>
              <p className="text-muted-foreground">
                Centro assistenza autorizzato per le principali marche. Riparazioni rapide, 
                manutenzione programmata e ricambi originali.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Location Section */}
      <section className="py-16 md:py-20 bg-secondary/30">
        <div className="container px-4 md:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-3xl md:text-4xl font-bold mb-6">
                Vieni a Trovarci
              </h2>
              <p className="text-muted-foreground mb-8">
                Il nostro showroom è aperto dal lunedì al venerdì. Vieni a vedere di persona 
                la nostra gamma di prodotti e a parlare con i nostri tecnici.
              </p>
              
              <div className="space-y-4">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <MapPin className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold">Indirizzo</p>
                    <p className="text-muted-foreground">Lungobisagno d'Istria 34, 16141 Genova (GE)</p>
                  </div>
                </div>
                
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <Phone className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold">Telefono</p>
                    <a href="tel:0107456076" className="text-primary hover:underline">010 7456076</a>
                  </div>
                </div>
              </div>
              
              <div className="mt-8">
                <Link 
                  href="/contact" 
                  className="inline-flex h-12 items-center justify-center rounded-lg bg-primary text-primary-foreground px-8 font-semibold hover:bg-primary/90 transition-colors"
                >
                  Contattaci
                </Link>
              </div>
            </div>
            
            <div className="aspect-video rounded-2xl overflow-hidden bg-muted">
              <iframe
                src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d2879.8!2d8.9!3d44.4!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2zNDTCsDI0JzAwLjAiTiA4wrA1NCcwMC4wIkU!5e0!3m2!1sit!2sit!4v1234567890"
                width="100%"
                height="100%"
                style={{ border: 0 }}
                allowFullScreen
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                className="grayscale"
              ></iframe>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 md:py-20 bg-primary text-primary-foreground">
        <div className="container px-4 md:px-8 text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Pronto a Iniziare?
          </h2>
          <p className="text-lg opacity-90 mb-8 max-w-2xl mx-auto">
            Visita il nostro showroom a Genova o contattaci per una consulenza personalizzata. 
            Il nostro team è a tua disposizione.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link 
              href="/products" 
              className="inline-flex h-12 items-center justify-center rounded-lg bg-background text-foreground px-8 font-semibold hover:bg-background/90 transition-colors"
            >
              Sfoglia il Catalogo
            </Link>
            <Link 
              href="/blog" 
              className="inline-flex h-12 items-center justify-center rounded-lg border-2 border-current px-8 font-semibold hover:bg-white/10 transition-colors"
            >
              Leggi le Guide
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
