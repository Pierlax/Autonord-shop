import { Metadata } from 'next';
import Link from 'next/link';
import { ChevronRight, Wrench, Truck, Clock, Shield, CheckCircle, Phone, Mail, Building2, Cog, Users, Award } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Noleggio & Assistenza | Autonord Service',
  description: 'Servizi di noleggio attrezzature edili e assistenza tecnica professionale. Centro assistenza autorizzato Milwaukee, Makita, Bosch a Genova.',
};

export default function ServicesPage() {
  return (
    <div className="flex flex-col">
      {/* Hero Section */}
      <section className="relative w-full py-20 md:py-28 bg-slate-900 overflow-hidden">
        <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1581092160562-40aa08e78837?q=80&w=2070&auto=format&fit=crop')] bg-cover bg-center opacity-20"></div>
        <div className="absolute inset-0 bg-gradient-to-r from-slate-950 via-slate-900/90 to-slate-900/70"></div>
        
        <div className="container relative z-10 px-4 md:px-8">
          <nav className="flex items-center text-sm text-slate-400 mb-8">
            <Link href="/" className="hover:text-primary transition-colors">Home</Link>
            <ChevronRight className="h-4 w-4 mx-2" />
            <span className="text-white">Noleggio & Assistenza</span>
          </nav>
          
          <div className="max-w-3xl">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-6 leading-tight">
              Noleggio & <span className="text-primary">Assistenza</span>
            </h1>
            <p className="text-xl text-slate-300 leading-relaxed">
              Servizi professionali per il tuo cantiere: noleggio attrezzature, assistenza tecnica 
              autorizzata e riparazioni rapide con ricambi originali.
            </p>
          </div>
        </div>
      </section>

      {/* Services Overview */}
      <section className="py-16 md:py-24">
        <div className="container px-4 md:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
            {/* Rental Service */}
            <div className="bg-card border border-border rounded-2xl overflow-hidden">
              <div className="p-8">
                <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center mb-6">
                  <Truck className="h-7 w-7 text-primary" />
                </div>
                <h2 className="text-2xl font-bold mb-4">Noleggio Attrezzature</h2>
                <p className="text-muted-foreground mb-6">
                  Flotta completa di macchine movimento terra e attrezzature speciali disponibili 
                  per noleggio a breve e lungo termine. Ideale per cantieri temporanei o esigenze specifiche.
                </p>
                
                <h3 className="font-semibold mb-3">Attrezzature Disponibili:</h3>
                <ul className="space-y-2 mb-6">
                  {[
                    'Mini escavatori e pale compatte',
                    'Piattaforme aeree e trabattelli',
                    'Compressori e generatori',
                    'Attrezzature per demolizione',
                    'Strumenti di misura e livellamento',
                    'Utensili elettrici professionali'
                  ].map((item, index) => (
                    <li key={index} className="flex items-center gap-2 text-sm text-muted-foreground">
                      <CheckCircle className="h-4 w-4 text-primary flex-shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>

                <div className="bg-secondary/30 rounded-lg p-4 mb-6">
                  <h4 className="font-semibold mb-2">Vantaggi del Noleggio</h4>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Clock className="h-4 w-4 text-primary" />
                      Disponibilità immediata
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Shield className="h-4 w-4 text-primary" />
                      Manutenzione inclusa
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Truck className="h-4 w-4 text-primary" />
                      Consegna in cantiere
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Users className="h-4 w-4 text-primary" />
                      Supporto tecnico
                    </div>
                  </div>
                </div>

                <Link 
                  href="/contact"
                  className="inline-flex items-center justify-center h-11 px-6 rounded-lg bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors w-full"
                >
                  Richiedi Preventivo Noleggio
                </Link>
              </div>
            </div>

            {/* Technical Assistance */}
            <div className="bg-card border border-border rounded-2xl overflow-hidden">
              <div className="p-8">
                <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center mb-6">
                  <Wrench className="h-7 w-7 text-primary" />
                </div>
                <h2 className="text-2xl font-bold mb-4">Assistenza Tecnica</h2>
                <p className="text-muted-foreground mb-6">
                  Centro assistenza autorizzato per le principali marche di elettroutensili. 
                  Tecnici certificati, ricambi originali e tempi di riparazione rapidi.
                </p>
                
                <h3 className="font-semibold mb-3">Servizi Offerti:</h3>
                <ul className="space-y-2 mb-6">
                  {[
                    'Riparazioni in garanzia e fuori garanzia',
                    'Manutenzione preventiva programmata',
                    'Diagnosi e preventivi gratuiti',
                    'Sostituzione parti consumabili',
                    'Taratura strumenti di misura',
                    'Consulenza tecnica specializzata'
                  ].map((item, index) => (
                    <li key={index} className="flex items-center gap-2 text-sm text-muted-foreground">
                      <CheckCircle className="h-4 w-4 text-primary flex-shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>

                <div className="bg-secondary/30 rounded-lg p-4 mb-6">
                  <h4 className="font-semibold mb-2">Marchi Autorizzati</h4>
                  <div className="flex flex-wrap gap-2">
                    {['Milwaukee', 'Makita', 'Bosch', 'Hilti', 'DeWalt', 'Metabo'].map((brand) => (
                      <span key={brand} className="px-3 py-1 bg-card rounded-full text-xs font-medium border border-border">
                        {brand}
                      </span>
                    ))}
                  </div>
                </div>

                <Link 
                  href="/contact"
                  className="inline-flex items-center justify-center h-11 px-6 rounded-lg bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors w-full"
                >
                  Prenota Assistenza
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Why Choose Us */}
      <section className="py-16 md:py-24 bg-secondary/30">
        <div className="container px-4 md:px-8">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Perché Scegliere Autonord Service
            </h2>
            <p className="text-muted-foreground">
              Oltre 18 anni di esperienza al servizio dei professionisti dell'edilizia
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-card border border-border rounded-xl p-6 text-center">
              <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <Award className="h-7 w-7 text-primary" />
              </div>
              <h3 className="font-bold mb-2">Centro Autorizzato</h3>
              <p className="text-sm text-muted-foreground">
                Certificazioni ufficiali dai principali produttori mondiali
              </p>
            </div>

            <div className="bg-card border border-border rounded-xl p-6 text-center">
              <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <Users className="h-7 w-7 text-primary" />
              </div>
              <h3 className="font-bold mb-2">Tecnici Esperti</h3>
              <p className="text-sm text-muted-foreground">
                Personale formato e aggiornato sulle ultime tecnologie
              </p>
            </div>

            <div className="bg-card border border-border rounded-xl p-6 text-center">
              <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <Cog className="h-7 w-7 text-primary" />
              </div>
              <h3 className="font-bold mb-2">Ricambi Originali</h3>
              <p className="text-sm text-muted-foreground">
                Solo componenti originali per garantire prestazioni ottimali
              </p>
            </div>

            <div className="bg-card border border-border rounded-xl p-6 text-center">
              <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <Clock className="h-7 w-7 text-primary" />
              </div>
              <h3 className="font-bold mb-2">Tempi Rapidi</h3>
              <p className="text-sm text-muted-foreground">
                Riparazioni veloci per minimizzare i fermi cantiere
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Process */}
      <section className="py-16 md:py-24">
        <div className="container px-4 md:px-8">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">
                Come Funziona
              </h2>
              <p className="text-muted-foreground">
                Un processo semplice e trasparente per ogni tua esigenza
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="text-center">
                <div className="w-16 h-16 rounded-full bg-primary text-primary-foreground flex items-center justify-center mx-auto mb-4 text-2xl font-bold">
                  1
                </div>
                <h3 className="font-bold mb-2">Contattaci</h3>
                <p className="text-sm text-muted-foreground">
                  Chiamaci o inviaci un'email descrivendo le tue esigenze. 
                  Ti risponderemo entro 24 ore.
                </p>
              </div>

              <div className="text-center">
                <div className="w-16 h-16 rounded-full bg-primary text-primary-foreground flex items-center justify-center mx-auto mb-4 text-2xl font-bold">
                  2
                </div>
                <h3 className="font-bold mb-2">Preventivo</h3>
                <p className="text-sm text-muted-foreground">
                  Ricevi un preventivo dettagliato e trasparente, 
                  senza costi nascosti o sorprese.
                </p>
              </div>

              <div className="text-center">
                <div className="w-16 h-16 rounded-full bg-primary text-primary-foreground flex items-center justify-center mx-auto mb-4 text-2xl font-bold">
                  3
                </div>
                <h3 className="font-bold mb-2">Servizio</h3>
                <p className="text-sm text-muted-foreground">
                  Eseguiamo il servizio nei tempi concordati 
                  con la massima professionalità.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Location */}
      <section className="py-16 md:py-24 bg-secondary/30">
        <div className="container px-4 md:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-sm font-medium text-primary mb-6">
                <Building2 className="h-4 w-4 mr-2" />
                Il Nostro Centro
              </div>
              <h2 className="text-3xl md:text-4xl font-bold mb-6">
                Vieni a Trovarci
              </h2>
              <p className="text-muted-foreground mb-8">
                Il nostro centro assistenza e showroom si trova a Genova, facilmente raggiungibile 
                e con ampio parcheggio. Vieni a scoprire la nostra gamma di prodotti e servizi.
              </p>

              <div className="space-y-4 mb-8">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Building2 className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h4 className="font-semibold">Indirizzo</h4>
                    <p className="text-muted-foreground">Lungobisagno d'Istria 34, 16141 Genova (GE)</p>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Clock className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h4 className="font-semibold">Orari</h4>
                    <p className="text-muted-foreground">Lun-Ven: 08:00-12:30 / 14:00-18:00</p>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Phone className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h4 className="font-semibold">Telefono</h4>
                    <a href="tel:0107456076" className="text-muted-foreground hover:text-primary transition-colors">010 7456076</a>
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-4">
                <Link 
                  href="/contact"
                  className="inline-flex items-center justify-center h-11 px-6 rounded-lg bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors"
                >
                  Contattaci
                </Link>
                <a 
                  href="https://maps.google.com/?q=Lungobisagno+d'Istria+34+Genova"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center h-11 px-6 rounded-lg border border-border hover:bg-accent transition-colors font-semibold"
                >
                  Indicazioni Stradali
                </a>
              </div>
            </div>

            <div className="h-[400px] rounded-2xl overflow-hidden">
              <iframe 
                src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d2880.867376766346!2d8.9545!3d44.4395!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2zNDTCsDI2JzIyLjIiTiA4wrA1NywxNi4yIkU!5e0!3m2!1sit!2sit!4v1620000000000!5m2!1sit!2sit" 
                width="100%" 
                height="100%" 
                style={{ border: 0 }} 
                allowFullScreen 
                loading="lazy"
                className="grayscale"
              ></iframe>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 md:py-20 bg-primary text-primary-foreground">
        <div className="container px-4 md:px-8 text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Hai un Progetto in Mente?
          </h2>
          <p className="text-lg opacity-90 mb-8 max-w-2xl mx-auto">
            Contattaci per una consulenza gratuita. Il nostro team è pronto ad aiutarti 
            a trovare la soluzione migliore per le tue esigenze.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a 
              href="tel:0107456076"
              className="inline-flex items-center justify-center h-12 px-8 rounded-lg bg-background text-foreground font-semibold hover:bg-background/90 transition-colors"
            >
              <Phone className="h-4 w-4 mr-2" />
              Chiama Ora
            </a>
            <a 
              href="mailto:info@autonordservice.com"
              className="inline-flex items-center justify-center h-12 px-8 rounded-lg border-2 border-current font-semibold hover:bg-white/10 transition-colors"
            >
              <Mail className="h-4 w-4 mr-2" />
              Invia Email
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
