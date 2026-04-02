import { Metadata } from 'next';
import Link from 'next/link';
import { ChevronRight, FileText, Scale, ShoppingCart, CreditCard, Truck, RefreshCw, AlertTriangle, Gavel } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Termini e Condizioni | Autonord Service',
  description: 'Termini e condizioni di vendita di Autonord Service. Leggi le condizioni generali per gli acquisti sul nostro e-commerce.',
};

export default function TermsPage() {
  return (
    <div className="flex flex-col">
      {/* Hero Section */}
      <section className="relative w-full py-16 md:py-20 bg-slate-900 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-slate-950 via-slate-900/90 to-slate-900/70"></div>
        
        <div className="container relative z-10 px-4 md:px-8">
          <nav className="flex items-center text-sm text-slate-400 mb-6">
            <Link href="/" className="hover:text-primary transition-colors">Home</Link>
            <ChevronRight className="h-4 w-4 mx-2" />
            <span className="text-white">Termini e Condizioni</span>
          </nav>
          
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 text-primary mb-4">
              <Scale className="h-5 w-5" />
              <span className="text-sm font-medium">Ultimo aggiornamento: Gennaio 2026</span>
            </div>
            <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
              Termini e Condizioni
            </h1>
            <p className="text-lg text-slate-300">
              Condizioni generali di vendita per gli acquisti effettuati su autonordservice.com
            </p>
          </div>
        </div>
      </section>

      {/* Content */}
      <section className="py-16 md:py-20">
        <div className="container px-4 md:px-8">
          <div className="max-w-4xl mx-auto">
            {/* Quick Navigation */}
            <div className="bg-card border border-border rounded-xl p-6 mb-12">
              <h2 className="font-bold mb-4 flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                Indice dei Contenuti
              </h2>
              <nav className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                <a href="#definizioni" className="text-muted-foreground hover:text-primary transition-colors">1. Definizioni</a>
                <a href="#ordini" className="text-muted-foreground hover:text-primary transition-colors">2. Ordini e Contratto</a>
                <a href="#prezzi" className="text-muted-foreground hover:text-primary transition-colors">3. Prezzi e Pagamenti</a>
                <a href="#spedizioni" className="text-muted-foreground hover:text-primary transition-colors">4. Spedizioni</a>
                <a href="#recesso" className="text-muted-foreground hover:text-primary transition-colors">5. Diritto di Recesso</a>
                <a href="#garanzia" className="text-muted-foreground hover:text-primary transition-colors">6. Garanzia</a>
                <a href="#responsabilita" className="text-muted-foreground hover:text-primary transition-colors">7. Limitazione Responsabilità</a>
                <a href="#legge" className="text-muted-foreground hover:text-primary transition-colors">8. Legge Applicabile</a>
              </nav>
            </div>

            {/* Sections */}
            <div className="space-y-12">
              <section id="definizioni">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <FileText className="h-5 w-5 text-primary" />
                  </div>
                  <h2 className="text-2xl font-bold">1. Definizioni</h2>
                </div>
                <div className="pl-[52px] space-y-4 text-muted-foreground">
                  <p>Ai fini delle presenti Condizioni Generali di Vendita, si intende per:</p>
                  <div className="space-y-3">
                    <div className="bg-secondary/30 rounded-lg p-4">
                      <p><strong className="text-foreground">"Venditore":</strong> Autonord Service S.r.l., con sede legale in Lungobisagno d'Istria 34, 16141 Genova (GE), P.IVA 01234567890.</p>
                    </div>
                    <div className="bg-secondary/30 rounded-lg p-4">
                      <p><strong className="text-foreground">"Cliente":</strong> qualsiasi persona fisica o giuridica che effettua acquisti sul sito autonordservice.com.</p>
                    </div>
                    <div className="bg-secondary/30 rounded-lg p-4">
                      <p><strong className="text-foreground">"Prodotti":</strong> tutti i beni messi in vendita sul sito web del Venditore.</p>
                    </div>
                    <div className="bg-secondary/30 rounded-lg p-4">
                      <p><strong className="text-foreground">"Sito":</strong> il sito web autonordservice.com e tutti i suoi sottodomini.</p>
                    </div>
                  </div>
                </div>
              </section>

              <section id="ordini">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <ShoppingCart className="h-5 w-5 text-primary" />
                  </div>
                  <h2 className="text-2xl font-bold">2. Ordini e Contratto</h2>
                </div>
                <div className="pl-[52px] space-y-4 text-muted-foreground">
                  <p>L'invio dell'ordine da parte del Cliente costituisce proposta contrattuale di acquisto. Il contratto si considera concluso nel momento in cui il Cliente riceve la conferma d'ordine via email.</p>
                  <p>Il Venditore si riserva il diritto di non accettare ordini:</p>
                  <ul className="list-disc pl-5 space-y-1">
                    <li>Da Clienti con cui esistano contenziosi in corso</li>
                    <li>In caso di indisponibilità dei prodotti</li>
                    <li>In caso di errori evidenti nel prezzo o nella descrizione del prodotto</li>
                    <li>In caso di sospetta frode o utilizzo improprio del sito</li>
                  </ul>
                  <p>Per gli acquisti B2B (business-to-business), è richiesta la registrazione con partita IVA valida.</p>
                </div>
              </section>

              <section id="prezzi">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <CreditCard className="h-5 w-5 text-primary" />
                  </div>
                  <h2 className="text-2xl font-bold">3. Prezzi e Pagamenti</h2>
                </div>
                <div className="pl-[52px] space-y-4 text-muted-foreground">
                  <p>Tutti i prezzi indicati sul sito sono espressi in Euro e si intendono:</p>
                  <ul className="list-disc pl-5 space-y-1">
                    <li><strong className="text-foreground">IVA esclusa</strong> per i clienti B2B con partita IVA</li>
                    <li><strong className="text-foreground">IVA inclusa</strong> per i consumatori privati</li>
                  </ul>
                  <p className="mt-4">Metodi di pagamento accettati:</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
                    {['Carta di Credito', 'PayPal', 'Bonifico Bancario', 'Contrassegno'].map((method, index) => (
                      <div key={index} className="bg-secondary/30 rounded-lg px-4 py-3 text-center text-sm font-medium">
                        {method}
                      </div>
                    ))}
                  </div>
                  <p className="mt-4 text-sm">Il pagamento in contrassegno prevede un supplemento di €5,00. Il bonifico bancario deve essere effettuato entro 3 giorni lavorativi dall'ordine.</p>
                </div>
              </section>

              <section id="spedizioni">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <Truck className="h-5 w-5 text-primary" />
                  </div>
                  <h2 className="text-2xl font-bold">4. Spedizioni</h2>
                </div>
                <div className="pl-[52px] space-y-4 text-muted-foreground">
                  <p>Le spedizioni vengono effettuate in tutta Italia tramite corriere espresso. I tempi di consegna indicativi sono:</p>
                  <div className="bg-secondary/30 rounded-lg p-4">
                    <ul className="space-y-2 text-sm">
                      <li><strong className="text-foreground">Nord Italia:</strong> 24/48 ore lavorative</li>
                      <li><strong className="text-foreground">Centro Italia:</strong> 48/72 ore lavorative</li>
                      <li><strong className="text-foreground">Sud e Isole:</strong> 72/96 ore lavorative</li>
                    </ul>
                  </div>
                  <p>La spedizione è gratuita per ordini superiori a €300,00 (IVA esclusa). Per ordini inferiori, il costo di spedizione viene calcolato in base al peso e alla destinazione.</p>
                  <p>Per maggiori dettagli, consulta la pagina <Link href="/shipping" className="text-primary hover:underline">Spedizioni e Resi</Link>.</p>
                </div>
              </section>

              <section id="recesso">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <RefreshCw className="h-5 w-5 text-primary" />
                  </div>
                  <h2 className="text-2xl font-bold">5. Diritto di Recesso</h2>
                </div>
                <div className="pl-[52px] space-y-4 text-muted-foreground">
                  <p>Ai sensi del D.Lgs. 206/2005 (Codice del Consumo), il consumatore ha diritto di recedere dal contratto entro <strong className="text-foreground">14 giorni</strong> dal ricevimento della merce, senza dover fornire alcuna motivazione.</p>
                  <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4">
                    <p className="text-amber-200 text-sm"><strong>Nota:</strong> Il diritto di recesso non si applica ai clienti B2B (professionisti con partita IVA).</p>
                  </div>
                  <p>Per esercitare il diritto di recesso:</p>
                  <ol className="list-decimal pl-5 space-y-2">
                    <li>Inviare comunicazione scritta a info@autonordservice.com</li>
                    <li>Restituire il prodotto integro, nella confezione originale</li>
                    <li>Le spese di restituzione sono a carico del Cliente</li>
                    <li>Il rimborso avverrà entro 14 giorni dal ricevimento del reso</li>
                  </ol>
                </div>
              </section>

              <section id="garanzia">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <Scale className="h-5 w-5 text-primary" />
                  </div>
                  <h2 className="text-2xl font-bold">6. Garanzia</h2>
                </div>
                <div className="pl-[52px] space-y-4 text-muted-foreground">
                  <p>Tutti i prodotti sono coperti dalla garanzia legale di conformità:</p>
                  <ul className="list-disc pl-5 space-y-1">
                    <li><strong className="text-foreground">Consumatori:</strong> 24 mesi dalla data di consegna</li>
                    <li><strong className="text-foreground">Professionisti:</strong> 12 mesi dalla data di consegna</li>
                  </ul>
                  <p>La garanzia copre i difetti di conformità esistenti al momento della consegna. Non sono coperti i danni derivanti da uso improprio, negligenza o normale usura.</p>
                  <p>Per maggiori dettagli, consulta la pagina <Link href="/warranty" className="text-primary hover:underline">Garanzia Prodotti</Link>.</p>
                </div>
              </section>

              <section id="responsabilita">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <AlertTriangle className="h-5 w-5 text-primary" />
                  </div>
                  <h2 className="text-2xl font-bold">7. Limitazione di Responsabilità</h2>
                </div>
                <div className="pl-[52px] space-y-4 text-muted-foreground">
                  <p>Il Venditore non è responsabile per:</p>
                  <ul className="list-disc pl-5 space-y-1">
                    <li>Danni indiretti, incidentali o consequenziali</li>
                    <li>Ritardi di consegna dovuti a cause di forza maggiore</li>
                    <li>Uso improprio dei prodotti acquistati</li>
                    <li>Interruzioni temporanee del servizio web</li>
                  </ul>
                  <p>La responsabilità massima del Venditore è limitata al valore dell'ordine.</p>
                </div>
              </section>

              <section id="legge">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <Gavel className="h-5 w-5 text-primary" />
                  </div>
                  <h2 className="text-2xl font-bold">8. Legge Applicabile e Foro Competente</h2>
                </div>
                <div className="pl-[52px] space-y-4 text-muted-foreground">
                  <p>Le presenti Condizioni Generali di Vendita sono regolate dalla legge italiana.</p>
                  <p>Per le controversie derivanti dall'interpretazione o esecuzione del contratto:</p>
                  <ul className="list-disc pl-5 space-y-1">
                    <li><strong className="text-foreground">Consumatori:</strong> foro del luogo di residenza del consumatore</li>
                    <li><strong className="text-foreground">Professionisti:</strong> foro di Genova</li>
                  </ul>
                  <p className="mt-4">È possibile ricorrere alla piattaforma ODR (Online Dispute Resolution) dell'Unione Europea per la risoluzione alternativa delle controversie: <a href="https://ec.europa.eu/consumers/odr" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">https://ec.europa.eu/consumers/odr</a></p>
                </div>
              </section>
            </div>

            {/* Contact CTA */}
            <div className="mt-16 bg-card border border-border rounded-xl p-6 text-center">
              <h3 className="text-lg font-bold mb-2">Hai domande sui Termini e Condizioni?</h3>
              <p className="text-muted-foreground mb-4">Il nostro team è a disposizione per chiarimenti</p>
              <Link 
                href="/contact"
                className="inline-flex items-center justify-center h-11 px-6 rounded-lg bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors"
              >
                Contattaci
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
