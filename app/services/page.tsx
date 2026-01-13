import { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { ChevronRight, Wrench, Truck, Clock, Shield, CheckCircle, Phone, Mail, Building2, Cog, Users, Award, ExternalLink } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Noleggio Miniescavatori & Assistenza | Autonord Service Genova',
  description: 'Noleggio miniescavatori Yanmar a Genova. Concessionario esclusivo. Flotta SV17VT, SV26, VIO27-6, VIO38-6, VIO50-6B. Assistenza tecnica autorizzata Milwaukee, Makita, Bosch.',
};

const yanmarFleet = [
  {
    model: 'SV17VT',
    description: 'Robusto ed affidabile, perfetto per il noleggio. Progettato per lavorare negli ambienti più difficili.',
    weight: '1.7 ton',
    depth: '2.5 m',
    ideal: 'Lavori in spazi ristretti, scavi di fondazione'
  },
  {
    model: 'SV26',
    description: 'Macchina compatta, perfetta per lavori in ambito urbano e lavori di creazione e sistemazione di aree verdi.',
    weight: '2.6 ton',
    depth: '2.8 m',
    ideal: 'Lavori urbani, giardinaggio professionale'
  },
  {
    model: 'VIO26-6',
    description: 'Mini-escavatore giro-sagoma (zero tail swing) che consente al telaio superiore di ruotare completamente.',
    weight: '2.6 ton',
    depth: '2.9 m',
    ideal: 'Lavori lungo muri, spazi confinati'
  },
  {
    model: 'VIO27-6',
    description: 'Prestazioni e stabilità eccezionale. Caratteristiche che contraddistinguono questo modello versatile.',
    weight: '2.7 ton',
    depth: '3.0 m',
    ideal: 'Scavi di precisione, lavori di ristrutturazione'
  },
  {
    model: 'VIO38-6',
    description: 'Dimensioni ottimizzate per prestazioni negli spazi ristretti. Motore Yanmar efficiente e affidabile.',
    weight: '3.8 ton',
    depth: '3.5 m',
    ideal: 'Cantieri medi, scavi profondi'
  },
  {
    model: 'VIO50-6B',
    description: 'Progettato per operare in completa sicurezza soprattutto quando si lavora lungo i muri o in prossimità di ostacoli.',
    weight: '5.0 ton',
    depth: '3.8 m',
    ideal: 'Lavori pesanti, demolizioni controllate'
  },
  {
    model: 'VIO57-6B',
    description: 'Motore common rail che soddisfa tutti i requisiti previsti dall\'Unione europea relativi alle emissioni.',
    weight: '5.7 ton',
    depth: '4.0 m',
    ideal: 'Cantieri grandi, scavi industriali'
  },
  {
    model: 'SV60-6B',
    description: 'Combinazione vincente di tecnologia ed innovazione, affianca le prestazioni di una macchina di classe superiore.',
    weight: '6.0 ton',
    depth: '4.2 m',
    ideal: 'Progetti complessi, movimento terra'
  }
];

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
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/20 border border-amber-500/30 text-amber-300 text-sm font-medium mb-6">
              <Award className="h-4 w-4" />
              Concessionario Esclusivo Yanmar — Provincia di Genova
            </div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-6 leading-tight">
              Noleggio & <span className="text-primary">Assistenza</span>
            </h1>
            <p className="text-xl text-slate-300 leading-relaxed">
              Flotta di miniescavatori Yanmar disponibili a noleggio e centro assistenza tecnica 
              autorizzato per i migliori brand di elettroutensili.
            </p>
          </div>
        </div>
      </section>

      {/* Yanmar Fleet Section */}
      <section className="py-16 md:py-24 bg-amber-500/5">
        <div className="container px-4 md:px-8">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-12">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <Image
                  src="/images/brands/yanmar.png"
                  alt="Yanmar"
                  width={120}
                  height={40}
                  className="h-10 w-auto"
                />
                <span className="px-2 py-1 bg-amber-500/20 text-amber-300 text-xs font-medium rounded">ESCLUSIVA GENOVA</span>
              </div>
              <h2 className="text-3xl md:text-4xl font-bold mb-2">Flotta Miniescavatori a Noleggio</h2>
              <p className="text-muted-foreground">
                8 modelli disponibili da 1.7 a 6 tonnellate. Consegna in cantiere entro 24h.
              </p>
            </div>
            <Link 
              href="/contact"
              className="inline-flex items-center justify-center h-12 px-6 rounded-lg bg-amber-500 text-black font-semibold hover:bg-amber-400 transition-colors"
            >
              <Phone className="h-4 w-4 mr-2" />
              Richiedi Preventivo
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {yanmarFleet.map((machine) => (
              <div key={machine.model} className="bg-card border border-amber-500/20 rounded-xl overflow-hidden hover:border-amber-500/50 transition-colors group">
                <div className="aspect-[4/3] bg-slate-800 relative overflow-hidden">
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Building2 className="h-16 w-16 text-amber-500/30" />
                  </div>
                  <div className="absolute top-3 left-3">
                    <span className="px-2 py-1 bg-amber-500 text-black text-xs font-bold rounded">
                      {machine.model}
                    </span>
                  </div>
                </div>
                <div className="p-4">
                  <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                    {machine.description}
                  </p>
                  <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                    <div className="bg-secondary/50 rounded px-2 py-1">
                      <span className="text-muted-foreground">Peso:</span>
                      <span className="font-medium ml-1">{machine.weight}</span>
                    </div>
                    <div className="bg-secondary/50 rounded px-2 py-1">
                      <span className="text-muted-foreground">Prof.:</span>
                      <span className="font-medium ml-1">{machine.depth}</span>
                    </div>
                  </div>
                  <p className="text-xs text-amber-400">
                    <strong>Ideale per:</strong> {machine.ideal}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-8 p-6 bg-card border border-border rounded-xl">
            <h3 className="font-bold mb-4">Vantaggi del Noleggio Yanmar con Autonord Service</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="flex items-start gap-3">
                <CheckCircle className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-sm">Disponibilità Immediata</p>
                  <p className="text-xs text-muted-foreground">Consegna in cantiere entro 24h</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-sm">Manutenzione Inclusa</p>
                  <p className="text-xs text-muted-foreground">Macchine sempre in perfetto stato</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-sm">Supporto Tecnico</p>
                  <p className="text-xs text-muted-foreground">Assistenza telefonica h24</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-sm">Tariffe Flessibili</p>
                  <p className="text-xs text-muted-foreground">Giornaliero, settimanale, mensile</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Services Grid */}
      <section className="py-16 md:py-24">
        <div className="container px-4 md:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
            {/* Other Rental Equipment */}
            <div className="bg-card border border-border rounded-2xl overflow-hidden">
              <div className="p-8">
                <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center mb-6">
                  <Truck className="h-7 w-7 text-primary" />
                </div>
                <h2 className="text-2xl font-bold mb-4">Altre Attrezzature a Noleggio</h2>
                <p className="text-muted-foreground mb-6">
                  Oltre ai miniescavatori Yanmar, offriamo una gamma completa di attrezzature 
                  per l'edilizia disponibili a noleggio.
                </p>
                
                <h3 className="font-semibold mb-3">Attrezzature Disponibili:</h3>
                <ul className="space-y-2 mb-6">
                  {[
                    'Camion e furgoni',
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
                    {['Milwaukee', 'Makita', 'Bosch', 'Hilti', 'DeWalt', 'Metabo', 'Festool', 'Husqvarna'].map((brand) => (
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
              <h3 className="font-bold mb-2">Concessionario Esclusivo</h3>
              <p className="text-sm text-muted-foreground">
                Unico dealer Yanmar autorizzato per la provincia di Genova
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

      {/* CTA Section */}
      <section className="py-16 md:py-20 bg-primary text-primary-foreground">
        <div className="container px-4 md:px-8 text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Hai Bisogno di un Preventivo?
          </h2>
          <p className="text-lg opacity-90 mb-8 max-w-2xl mx-auto">
            Contattaci per un preventivo personalizzato per noleggio o assistenza. 
            Rispondiamo entro 24 ore.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a 
              href="tel:0107456076"
              className="inline-flex h-12 items-center justify-center rounded-lg bg-background text-foreground px-8 font-semibold hover:bg-background/90 transition-colors"
            >
              <Phone className="h-4 w-4 mr-2" />
              010 7456076
            </a>
            <Link 
              href="/contact" 
              className="inline-flex h-12 items-center justify-center rounded-lg border-2 border-current px-8 font-semibold hover:bg-white/10 transition-colors"
            >
              <Mail className="h-4 w-4 mr-2" />
              Invia Richiesta
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
