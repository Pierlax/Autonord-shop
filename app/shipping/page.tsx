import { Metadata } from 'next';
import Link from 'next/link';
import { ChevronRight, Truck, Package, Clock, MapPin, RefreshCw, AlertCircle, CheckCircle, Euro } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Spedizioni e Resi | Autonord Service',
  description: 'Informazioni su spedizioni, tempi di consegna e politica resi di Autonord Service. Spedizione gratuita per ordini superiori a €300.',
};

export default function ShippingPage() {
  return (
    <div className="flex flex-col">
      {/* Hero Section */}
      <section className="relative w-full py-16 md:py-20 bg-slate-900 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-slate-950 via-slate-900/90 to-slate-900/70"></div>
        
        <div className="container relative z-10 px-4 md:px-8">
          <nav className="flex items-center text-sm text-slate-400 mb-6">
            <Link href="/" className="hover:text-primary transition-colors">Home</Link>
            <ChevronRight className="h-4 w-4 mx-2" />
            <span className="text-white">Spedizioni e Resi</span>
          </nav>
          
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 text-primary mb-4">
              <Truck className="h-5 w-5" />
              <span className="text-sm font-medium">Consegna in 24/48h</span>
            </div>
            <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
              Spedizioni e Resi
            </h1>
            <p className="text-lg text-slate-300">
              Tutto quello che devi sapere su consegne, costi di spedizione e procedura di reso.
            </p>
          </div>
        </div>
      </section>

      {/* Free Shipping Banner */}
      <section className="py-6 bg-primary text-primary-foreground">
        <div className="container px-4 md:px-8">
          <div className="flex flex-col md:flex-row items-center justify-center gap-4 text-center">
            <Package className="h-8 w-8" />
            <div>
              <p className="text-lg font-bold">Spedizione Gratuita per ordini superiori a €300</p>
              <p className="text-sm opacity-90">IVA esclusa • Valido per tutta Italia</p>
            </div>
          </div>
        </div>
      </section>

      {/* Content */}
      <section className="py-16 md:py-20">
        <div className="container px-4 md:px-8">
          <div className="max-w-4xl mx-auto">
            {/* Shipping Info */}
            <div className="mb-16">
              <h2 className="text-3xl font-bold mb-8 flex items-center gap-3">
                <Truck className="h-8 w-8 text-primary" />
                Informazioni Spedizione
              </h2>

              {/* Delivery Times */}
              <div className="bg-card border border-border rounded-xl p-6 mb-8">
                <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                  <Clock className="h-5 w-5 text-primary" />
                  Tempi di Consegna
                </h3>
                <p className="text-muted-foreground mb-6">
                  Gli ordini vengono elaborati e spediti entro 24 ore lavorative dalla conferma del pagamento. 
                  I tempi di consegna variano in base alla destinazione:
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-secondary/30 rounded-lg p-4 text-center">
                    <MapPin className="h-6 w-6 text-primary mx-auto mb-2" />
                    <h4 className="font-bold">Nord Italia</h4>
                    <p className="text-2xl font-bold text-primary my-2">24-48h</p>
                    <p className="text-xs text-muted-foreground">Piemonte, Lombardia, Veneto, Emilia-Romagna, Liguria, Friuli-Venezia Giulia, Trentino-Alto Adige</p>
                  </div>
                  <div className="bg-secondary/30 rounded-lg p-4 text-center">
                    <MapPin className="h-6 w-6 text-primary mx-auto mb-2" />
                    <h4 className="font-bold">Centro Italia</h4>
                    <p className="text-2xl font-bold text-primary my-2">48-72h</p>
                    <p className="text-xs text-muted-foreground">Toscana, Umbria, Marche, Lazio, Abruzzo</p>
                  </div>
                  <div className="bg-secondary/30 rounded-lg p-4 text-center">
                    <MapPin className="h-6 w-6 text-primary mx-auto mb-2" />
                    <h4 className="font-bold">Sud e Isole</h4>
                    <p className="text-2xl font-bold text-primary my-2">72-96h</p>
                    <p className="text-xs text-muted-foreground">Campania, Puglia, Calabria, Sicilia, Sardegna, Molise, Basilicata</p>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground mt-4">
                  * I tempi sono espressi in ore/giorni lavorativi e sono indicativi. Possono variare in periodi di alta stagione o per cause di forza maggiore.
                </p>
              </div>

              {/* Shipping Costs */}
              <div className="bg-card border border-border rounded-xl p-6 mb-8">
                <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                  <Euro className="h-5 w-5 text-primary" />
                  Costi di Spedizione
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left py-3 px-4 font-semibold">Valore Ordine (IVA esclusa)</th>
                        <th className="text-left py-3 px-4 font-semibold">Costo Spedizione</th>
                      </tr>
                    </thead>
                    <tbody className="text-muted-foreground">
                      <tr className="border-b border-border/50">
                        <td className="py-3 px-4">Fino a €50,00</td>
                        <td className="py-3 px-4">€9,90</td>
                      </tr>
                      <tr className="border-b border-border/50">
                        <td className="py-3 px-4">Da €50,01 a €150,00</td>
                        <td className="py-3 px-4">€7,90</td>
                      </tr>
                      <tr className="border-b border-border/50">
                        <td className="py-3 px-4">Da €150,01 a €300,00</td>
                        <td className="py-3 px-4">€4,90</td>
                      </tr>
                      <tr className="bg-primary/5">
                        <td className="py-3 px-4 font-semibold text-foreground">Oltre €300,00</td>
                        <td className="py-3 px-4 font-bold text-primary">GRATUITA</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div className="mt-4 space-y-2 text-sm text-muted-foreground">
                  <p>• Per Sicilia, Sardegna e zone disagiate potrebbe essere applicato un supplemento</p>
                  <p>• Spedizioni di materiale pesante o voluminoso: costo calcolato al checkout</p>
                  <p>• Pagamento in contrassegno: supplemento €5,00</p>
                </div>
              </div>

              {/* Tracking */}
              <div className="bg-card border border-border rounded-xl p-6">
                <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                  <Package className="h-5 w-5 text-primary" />
                  Tracciamento Spedizione
                </h3>
                <p className="text-muted-foreground mb-4">
                  Appena il tuo ordine viene spedito, riceverai un'email con il codice di tracciamento. 
                  Potrai seguire lo stato della consegna direttamente sul sito del corriere.
                </p>
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <span>Corrieri partner: BRT, GLS, DHL</span>
                </div>
              </div>
            </div>

            {/* Returns Info */}
            <div>
              <h2 className="text-3xl font-bold mb-8 flex items-center gap-3">
                <RefreshCw className="h-8 w-8 text-primary" />
                Politica Resi
              </h2>

              {/* Return Policy */}
              <div className="bg-card border border-border rounded-xl p-6 mb-8">
                <h3 className="text-xl font-bold mb-4">Diritto di Recesso</h3>
                <p className="text-muted-foreground mb-4">
                  Ai sensi del Codice del Consumo, i consumatori privati hanno diritto di recedere dall'acquisto 
                  entro <strong className="text-foreground">14 giorni</strong> dalla ricezione della merce, senza dover fornire alcuna motivazione.
                </p>
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 mb-6">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-amber-200">
                      <strong>Importante:</strong> Il diritto di recesso non si applica ai clienti B2B (professionisti con partita IVA) 
                      e ai prodotti personalizzati o su misura.
                    </p>
                  </div>
                </div>
              </div>

              {/* Return Procedure */}
              <div className="bg-card border border-border rounded-xl p-6 mb-8">
                <h3 className="text-xl font-bold mb-4">Procedura di Reso</h3>
                <div className="space-y-4">
                  <div className="flex gap-4">
                    <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold flex-shrink-0">1</div>
                    <div>
                      <h4 className="font-semibold mb-1">Richiedi il reso</h4>
                      <p className="text-sm text-muted-foreground">Invia un'email a <a href="mailto:resi@autonordservice.com" className="text-primary hover:underline">resi@autonordservice.com</a> indicando il numero d'ordine e il motivo del reso.</p>
                    </div>
                  </div>
                  <div className="flex gap-4">
                    <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold flex-shrink-0">2</div>
                    <div>
                      <h4 className="font-semibold mb-1">Ricevi l'autorizzazione</h4>
                      <p className="text-sm text-muted-foreground">Entro 24 ore riceverai l'autorizzazione al reso (RMA) con le istruzioni per la spedizione.</p>
                    </div>
                  </div>
                  <div className="flex gap-4">
                    <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold flex-shrink-0">3</div>
                    <div>
                      <h4 className="font-semibold mb-1">Prepara il pacco</h4>
                      <p className="text-sm text-muted-foreground">Imballa il prodotto nella confezione originale, includendo tutti gli accessori e la documentazione.</p>
                    </div>
                  </div>
                  <div className="flex gap-4">
                    <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold flex-shrink-0">4</div>
                    <div>
                      <h4 className="font-semibold mb-1">Spedisci il reso</h4>
                      <p className="text-sm text-muted-foreground">Invia il pacco all'indirizzo indicato. Le spese di spedizione per il reso sono a carico del cliente.</p>
                    </div>
                  </div>
                  <div className="flex gap-4">
                    <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold flex-shrink-0">5</div>
                    <div>
                      <h4 className="font-semibold mb-1">Ricevi il rimborso</h4>
                      <p className="text-sm text-muted-foreground">Dopo la verifica del prodotto, il rimborso verrà effettuato entro 14 giorni sullo stesso metodo di pagamento utilizzato.</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Conditions */}
              <div className="bg-card border border-border rounded-xl p-6">
                <h3 className="text-xl font-bold mb-4">Condizioni per il Reso</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h4 className="font-semibold text-green-500 mb-3 flex items-center gap-2">
                      <CheckCircle className="h-5 w-5" />
                      Reso Accettato
                    </h4>
                    <ul className="space-y-2 text-sm text-muted-foreground">
                      <li>• Prodotto integro e non utilizzato</li>
                      <li>• Confezione originale intatta</li>
                      <li>• Tutti gli accessori inclusi</li>
                      <li>• Documentazione completa</li>
                      <li>• Richiesta entro 14 giorni</li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="font-semibold text-red-500 mb-3 flex items-center gap-2">
                      <AlertCircle className="h-5 w-5" />
                      Reso Non Accettato
                    </h4>
                    <ul className="space-y-2 text-sm text-muted-foreground">
                      <li>• Prodotto usato o danneggiato</li>
                      <li>• Confezione mancante o rovinata</li>
                      <li>• Accessori mancanti</li>
                      <li>• Prodotti personalizzati</li>
                      <li>• Richiesta oltre i 14 giorni</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>

            {/* Contact CTA */}
            <div className="mt-16 bg-card border border-border rounded-xl p-6 text-center">
              <h3 className="text-lg font-bold mb-2">Hai bisogno di assistenza?</h3>
              <p className="text-muted-foreground mb-4">Il nostro servizio clienti è a tua disposizione</p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link 
                  href="/contact"
                  className="inline-flex items-center justify-center h-11 px-6 rounded-lg bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors"
                >
                  Contattaci
                </Link>
                <a 
                  href="tel:0107456076"
                  className="inline-flex items-center justify-center h-11 px-6 rounded-lg border border-border hover:bg-accent transition-colors font-semibold"
                >
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
