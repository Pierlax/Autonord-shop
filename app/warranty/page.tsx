import { Metadata } from 'next';
import Link from 'next/link';
import { ChevronRight, Shield, CheckCircle, AlertCircle, Wrench, Clock, FileText, Phone, Mail } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Garanzia Prodotti | Autonord Service',
  description: 'Informazioni sulla garanzia dei prodotti Autonord Service. Garanzia ufficiale del produttore e assistenza tecnica autorizzata.',
};

export default function WarrantyPage() {
  return (
    <div className="flex flex-col">
      {/* Hero Section */}
      <section className="relative w-full py-16 md:py-20 bg-slate-900 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-slate-950 via-slate-900/90 to-slate-900/70"></div>
        
        <div className="container relative z-10 px-4 md:px-8">
          <nav className="flex items-center text-sm text-slate-400 mb-6">
            <Link href="/" className="hover:text-primary transition-colors">Home</Link>
            <ChevronRight className="h-4 w-4 mx-2" />
            <span className="text-white">Garanzia Prodotti</span>
          </nav>
          
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 text-primary mb-4">
              <Shield className="h-5 w-5" />
              <span className="text-sm font-medium">Garanzia Ufficiale</span>
            </div>
            <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
              Garanzia Prodotti
            </h1>
            <p className="text-lg text-slate-300">
              Tutti i prodotti sono coperti dalla garanzia ufficiale del produttore. 
              Centro assistenza autorizzato per le principali marche.
            </p>
          </div>
        </div>
      </section>

      {/* Warranty Highlights */}
      <section className="py-8 bg-primary text-primary-foreground">
        <div className="container px-4 md:px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-center">
            <div className="flex flex-col items-center">
              <Shield className="h-8 w-8 mb-2" />
              <p className="font-bold">Garanzia Ufficiale</p>
              <p className="text-sm opacity-90">Prodotti 100% originali</p>
            </div>
            <div className="flex flex-col items-center">
              <Wrench className="h-8 w-8 mb-2" />
              <p className="font-bold">Centro Assistenza Autorizzato</p>
              <p className="text-sm opacity-90">Tecnici certificati</p>
            </div>
            <div className="flex flex-col items-center">
              <Clock className="h-8 w-8 mb-2" />
              <p className="font-bold">Riparazioni Rapide</p>
              <p className="text-sm opacity-90">Tempi di intervento ridotti</p>
            </div>
          </div>
        </div>
      </section>

      {/* Content */}
      <section className="py-16 md:py-20">
        <div className="container px-4 md:px-8">
          <div className="max-w-4xl mx-auto">
            {/* Warranty Duration */}
            <div className="mb-16">
              <h2 className="text-3xl font-bold mb-8 flex items-center gap-3">
                <Clock className="h-8 w-8 text-primary" />
                Durata della Garanzia
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                <div className="bg-card border border-border rounded-xl p-6">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                    <span className="text-2xl font-bold text-primary">24</span>
                  </div>
                  <h3 className="text-xl font-bold mb-2">Consumatori Privati</h3>
                  <p className="text-3xl font-bold text-primary mb-2">24 Mesi</p>
                  <p className="text-sm text-muted-foreground">
                    Garanzia legale di conformità ai sensi del D.Lgs. 206/2005 (Codice del Consumo). 
                    Decorre dalla data di consegna del prodotto.
                  </p>
                </div>
                <div className="bg-card border border-border rounded-xl p-6">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                    <span className="text-2xl font-bold text-primary">12</span>
                  </div>
                  <h3 className="text-xl font-bold mb-2">Professionisti (B2B)</h3>
                  <p className="text-3xl font-bold text-primary mb-2">12 Mesi</p>
                  <p className="text-sm text-muted-foreground">
                    Garanzia commerciale per acquisti con partita IVA. 
                    Decorre dalla data di fatturazione.
                  </p>
                </div>
              </div>

              <div className="bg-secondary/30 rounded-xl p-6">
                <h4 className="font-bold mb-3">Garanzie Estese del Produttore</h4>
                <p className="text-muted-foreground text-sm mb-4">
                  Alcuni produttori offrono programmi di garanzia estesa. Verifica le condizioni specifiche nella documentazione del prodotto:
                </p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center text-sm">
                  <div className="bg-card rounded-lg p-3">
                    <p className="font-bold text-primary">Milwaukee</p>
                    <p className="text-muted-foreground">Fino a 5 anni</p>
                  </div>
                  <div className="bg-card rounded-lg p-3">
                    <p className="font-bold text-primary">Makita</p>
                    <p className="text-muted-foreground">3 anni</p>
                  </div>
                  <div className="bg-card rounded-lg p-3">
                    <p className="font-bold text-primary">Bosch</p>
                    <p className="text-muted-foreground">3 anni</p>
                  </div>
                  <div className="bg-card rounded-lg p-3">
                    <p className="font-bold text-primary">Hilti</p>
                    <p className="text-muted-foreground">2 anni</p>
                  </div>
                </div>
              </div>
            </div>

            {/* What's Covered */}
            <div className="mb-16">
              <h2 className="text-3xl font-bold mb-8 flex items-center gap-3">
                <FileText className="h-8 w-8 text-primary" />
                Copertura della Garanzia
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-card border border-border rounded-xl p-6">
                  <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-green-500">
                    <CheckCircle className="h-5 w-5" />
                    Cosa è Coperto
                  </h3>
                  <ul className="space-y-3 text-sm text-muted-foreground">
                    <li className="flex items-start gap-2">
                      <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0 mt-0.5" />
                      <span>Difetti di fabbricazione e materiali</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0 mt-0.5" />
                      <span>Malfunzionamenti non dovuti all'uso</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0 mt-0.5" />
                      <span>Difetti di conformità presenti alla consegna</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0 mt-0.5" />
                      <span>Componenti elettrici ed elettronici difettosi</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0 mt-0.5" />
                      <span>Parti meccaniche difettose</span>
                    </li>
                  </ul>
                </div>

                <div className="bg-card border border-border rounded-xl p-6">
                  <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-red-500">
                    <AlertCircle className="h-5 w-5" />
                    Cosa NON è Coperto
                  </h3>
                  <ul className="space-y-3 text-sm text-muted-foreground">
                    <li className="flex items-start gap-2">
                      <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
                      <span>Danni da uso improprio o negligenza</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
                      <span>Normale usura delle parti consumabili</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
                      <span>Danni da cadute, urti o agenti esterni</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
                      <span>Riparazioni effettuate da centri non autorizzati</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
                      <span>Utilizzo di accessori non originali</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>

            {/* How to Claim */}
            <div className="mb-16">
              <h2 className="text-3xl font-bold mb-8 flex items-center gap-3">
                <Wrench className="h-8 w-8 text-primary" />
                Come Richiedere Assistenza
              </h2>

              <div className="bg-card border border-border rounded-xl p-6 mb-8">
                <div className="space-y-6">
                  <div className="flex gap-4">
                    <div className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold flex-shrink-0">1</div>
                    <div>
                      <h4 className="font-semibold mb-1">Contattaci</h4>
                      <p className="text-sm text-muted-foreground">
                        Invia un'email a <a href="mailto:assistenza@autonordservice.com" className="text-primary hover:underline">assistenza@autonordservice.com</a> o 
                        chiamaci al <a href="tel:0107456076" className="text-primary hover:underline">010 7456076</a> descrivendo il problema.
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-4">
                    <div className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold flex-shrink-0">2</div>
                    <div>
                      <h4 className="font-semibold mb-1">Prepara la Documentazione</h4>
                      <p className="text-sm text-muted-foreground">
                        Tieni a portata di mano: fattura o scontrino d'acquisto, numero di serie del prodotto, 
                        descrizione dettagliata del difetto, foto del problema (se possibile).
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-4">
                    <div className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold flex-shrink-0">3</div>
                    <div>
                      <h4 className="font-semibold mb-1">Consegna o Spedizione</h4>
                      <p className="text-sm text-muted-foreground">
                        Puoi consegnare il prodotto direttamente presso il nostro centro assistenza a Genova 
                        oppure spedirlo all'indirizzo che ti forniremo.
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-4">
                    <div className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold flex-shrink-0">4</div>
                    <div>
                      <h4 className="font-semibold mb-1">Diagnosi e Riparazione</h4>
                      <p className="text-sm text-muted-foreground">
                        I nostri tecnici valuteranno il prodotto e, se il difetto rientra in garanzia, 
                        procederanno alla riparazione o sostituzione senza costi aggiuntivi.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Service Center Info */}
              <div className="bg-secondary/30 rounded-xl p-6">
                <h4 className="font-bold mb-4 flex items-center gap-2">
                  <Wrench className="h-5 w-5 text-primary" />
                  Centro Assistenza Autorizzato
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <p className="text-sm text-muted-foreground mb-4">
                      Siamo centro assistenza autorizzato per le principali marche di elettroutensili professionali. 
                      I nostri tecnici sono certificati e utilizzano esclusivamente ricambi originali.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {['Milwaukee', 'Makita', 'Bosch', 'Hilti', 'DeWalt', 'Metabo'].map((brand) => (
                        <span key={brand} className="px-3 py-1 bg-card rounded-full text-xs font-medium">
                          {brand}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                        <Clock className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium text-sm">Tempi di Riparazione</p>
                        <p className="text-xs text-muted-foreground">5-10 giorni lavorativi</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                        <CheckCircle className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium text-sm">Ricambi Originali</p>
                        <p className="text-xs text-muted-foreground">Sempre disponibili in magazzino</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Contact CTA */}
            <div className="bg-card border border-border rounded-xl p-8 text-center">
              <Shield className="h-12 w-12 text-primary mx-auto mb-4" />
              <h3 className="text-xl font-bold mb-2">Hai bisogno di assistenza in garanzia?</h3>
              <p className="text-muted-foreground mb-6">Il nostro team tecnico è a tua disposizione</p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <a 
                  href="mailto:assistenza@autonordservice.com"
                  className="inline-flex items-center justify-center h-11 px-6 rounded-lg bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors"
                >
                  <Mail className="h-4 w-4 mr-2" />
                  assistenza@autonordservice.com
                </a>
                <a 
                  href="tel:0107456076"
                  className="inline-flex items-center justify-center h-11 px-6 rounded-lg border border-border hover:bg-accent transition-colors font-semibold"
                >
                  <Phone className="h-4 w-4 mr-2" />
                  010 7456076
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
