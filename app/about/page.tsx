import { Metadata } from 'next';
import Link from 'next/link';
import { ChevronRight, Award, Users, Truck, Shield, Wrench, Building2, Target, Heart } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Chi Siamo | Autonord Service',
  description: 'Autonord Service: dal 2006 leader nella vendita e noleggio di elettroutensili professionali e attrezzature per l\'edilizia a Genova. Partner ufficiale Milwaukee.',
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
              Dal 2006 siamo il punto di riferimento per i professionisti dell'edilizia in Liguria. 
              Elettroutensili, attrezzature e assistenza tecnica di livello superiore.
            </p>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-12 bg-secondary/50 border-y border-border/30">
        <div className="container px-4 md:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            <div className="text-center">
              <div className="text-4xl md:text-5xl font-bold text-primary mb-2">18+</div>
              <div className="text-sm text-muted-foreground">Anni di Esperienza</div>
            </div>
            <div className="text-center">
              <div className="text-4xl md:text-5xl font-bold text-primary mb-2">5000+</div>
              <div className="text-sm text-muted-foreground">Prodotti in Catalogo</div>
            </div>
            <div className="text-center">
              <div className="text-4xl md:text-5xl font-bold text-primary mb-2">2000+</div>
              <div className="text-sm text-muted-foreground">Clienti Soddisfatti</div>
            </div>
            <div className="text-center">
              <div className="text-4xl md:text-5xl font-bold text-primary mb-2">24h</div>
              <div className="text-sm text-muted-foreground">Assistenza Tecnica</div>
            </div>
          </div>
        </div>
      </section>

      {/* Story Section */}
      <section className="py-16 md:py-24">
        <div className="container px-4 md:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            <div>
              <div className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-sm font-medium text-primary mb-6">
                <Building2 className="h-4 w-4 mr-2" />
                La Nostra Storia
              </div>
              <h2 className="text-3xl md:text-4xl font-bold mb-6">
                Una Passione che Diventa Professione
              </h2>
              <div className="space-y-4 text-muted-foreground leading-relaxed">
                <p>
                  Autonord Service nasce nel 2006 a Genova dalla passione per il mondo dell'edilizia e dalla volontà 
                  di offrire ai professionisti del settore un servizio di qualità superiore. Quello che è iniziato 
                  come un piccolo punto vendita si è trasformato in un centro di riferimento per tutto il Nord-Ovest italiano.
                </p>
                <p>
                  La nostra filosofia è semplice: non vendiamo solo prodotti, ma soluzioni complete. Ogni cliente 
                  che entra nel nostro showroom o visita il nostro sito trova un team di esperti pronti ad ascoltare 
                  le sue esigenze e a proporre la soluzione più adatta al suo lavoro.
                </p>
                <p>
                  Oggi siamo partner ufficiali dei migliori brand mondiali come Milwaukee, Makita, Bosch e Hilti, 
                  e continuiamo a investire in formazione e tecnologia per restare sempre al passo con le innovazioni del settore.
                </p>
              </div>
            </div>
            <div className="relative">
              <div className="aspect-[4/3] rounded-2xl overflow-hidden bg-muted">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-transparent"></div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center p-8">
                    <Award className="h-16 w-16 text-primary mx-auto mb-4" />
                    <p className="text-lg font-semibold">Partner Ufficiale</p>
                    <p className="text-muted-foreground">dei migliori brand mondiali</p>
                  </div>
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
              <h3 className="text-lg font-bold mb-2">Competenza</h3>
              <p className="text-sm text-muted-foreground">
                Il nostro team è formato da tecnici specializzati con anni di esperienza nel settore edile.
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
                Costruiamo rapporti duraturi con i nostri clienti, basati su fiducia e trasparenza.
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
                Oltre 5.000 prodotti professionali in pronta consegna. Spedizione in 24/48h in tutta Italia 
                con corriere espresso tracciato.
              </p>
            </div>

            <div className="text-center p-8 rounded-2xl bg-gradient-to-b from-primary/5 to-transparent border border-border/50">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6">
                <Building2 className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-xl font-bold mb-3">Noleggio</h3>
              <p className="text-muted-foreground">
                Flotta di macchine movimento terra e attrezzature speciali disponibili per noleggio 
                a breve e lungo termine.
              </p>
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
              href="/contact" 
              className="inline-flex h-12 items-center justify-center rounded-lg border-2 border-current px-8 font-semibold hover:bg-white/10 transition-colors"
            >
              Contattaci
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
