import { Metadata } from 'next';
import Link from 'next/link';
import { ChevronRight, Shield, FileText, Lock, Eye, UserCheck, Server, Mail } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Privacy Policy | Autonord Service',
  description: 'Informativa sulla privacy di Autonord Service. Scopri come trattiamo e proteggiamo i tuoi dati personali.',
};

export default function PrivacyPage() {
  return (
    <div className="flex flex-col">
      {/* Hero Section */}
      <section className="relative w-full py-16 md:py-20 bg-slate-900 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-slate-950 via-slate-900/90 to-slate-900/70"></div>
        
        <div className="container relative z-10 px-4 md:px-8">
          <nav className="flex items-center text-sm text-slate-400 mb-6">
            <Link href="/" className="hover:text-primary transition-colors">Home</Link>
            <ChevronRight className="h-4 w-4 mx-2" />
            <span className="text-white">Privacy Policy</span>
          </nav>
          
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 text-primary mb-4">
              <Shield className="h-5 w-5" />
              <span className="text-sm font-medium">Ultimo aggiornamento: Gennaio 2026</span>
            </div>
            <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
              Privacy Policy
            </h1>
            <p className="text-lg text-slate-300">
              Informativa sul trattamento dei dati personali ai sensi del Regolamento UE 2016/679 (GDPR).
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
                <a href="#titolare" className="text-muted-foreground hover:text-primary transition-colors">1. Titolare del Trattamento</a>
                <a href="#dati" className="text-muted-foreground hover:text-primary transition-colors">2. Dati Raccolti</a>
                <a href="#finalita" className="text-muted-foreground hover:text-primary transition-colors">3. Finalità del Trattamento</a>
                <a href="#base-giuridica" className="text-muted-foreground hover:text-primary transition-colors">4. Base Giuridica</a>
                <a href="#conservazione" className="text-muted-foreground hover:text-primary transition-colors">5. Conservazione dei Dati</a>
                <a href="#diritti" className="text-muted-foreground hover:text-primary transition-colors">6. Diritti dell'Interessato</a>
                <a href="#cookie" className="text-muted-foreground hover:text-primary transition-colors">7. Cookie Policy</a>
                <a href="#contatti" className="text-muted-foreground hover:text-primary transition-colors">8. Contatti</a>
              </nav>
            </div>

            {/* Sections */}
            <div className="prose prose-invert prose-slate max-w-none">
              <section id="titolare" className="mb-12">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <UserCheck className="h-5 w-5 text-primary" />
                  </div>
                  <h2 className="text-2xl font-bold m-0">1. Titolare del Trattamento</h2>
                </div>
                <div className="pl-[52px]">
                  <p className="text-muted-foreground mb-4">
                    Il Titolare del trattamento dei dati personali è:
                  </p>
                  <div className="bg-secondary/30 rounded-lg p-4 text-sm">
                    <p className="font-semibold">Autonord Service S.r.l.</p>
                    <p className="text-muted-foreground">Lungobisagno d'Istria 34, 16141 Genova (GE)</p>
                    <p className="text-muted-foreground">P.IVA: 01234567890</p>
                    <p className="text-muted-foreground">Email: privacy@autonordservice.com</p>
                    <p className="text-muted-foreground">Tel: 010 7456076</p>
                  </div>
                </div>
              </section>

              <section id="dati" className="mb-12">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <Eye className="h-5 w-5 text-primary" />
                  </div>
                  <h2 className="text-2xl font-bold m-0">2. Dati Raccolti</h2>
                </div>
                <div className="pl-[52px] space-y-4 text-muted-foreground">
                  <p>I dati personali raccolti attraverso questo sito web includono:</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-secondary/30 rounded-lg p-4">
                      <h4 className="font-semibold text-foreground mb-2">Dati identificativi</h4>
                      <ul className="text-sm space-y-1">
                        <li>• Nome e cognome</li>
                        <li>• Ragione sociale</li>
                        <li>• Indirizzo email</li>
                        <li>• Numero di telefono</li>
                        <li>• Indirizzo di spedizione</li>
                      </ul>
                    </div>
                    <div className="bg-secondary/30 rounded-lg p-4">
                      <h4 className="font-semibold text-foreground mb-2">Dati di navigazione</h4>
                      <ul className="text-sm space-y-1">
                        <li>• Indirizzo IP</li>
                        <li>• Browser e dispositivo</li>
                        <li>• Pagine visitate</li>
                        <li>• Data e ora di accesso</li>
                        <li>• Cookie tecnici e analitici</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </section>

              <section id="finalita" className="mb-12">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <Lock className="h-5 w-5 text-primary" />
                  </div>
                  <h2 className="text-2xl font-bold m-0">3. Finalità del Trattamento</h2>
                </div>
                <div className="pl-[52px] space-y-4 text-muted-foreground">
                  <p>I dati personali sono trattati per le seguenti finalità:</p>
                  <ul className="space-y-2">
                    <li><strong className="text-foreground">Esecuzione contrattuale:</strong> gestione ordini, spedizioni, fatturazione e assistenza post-vendita.</li>
                    <li><strong className="text-foreground">Comunicazioni di servizio:</strong> invio di conferme ordine, aggiornamenti sullo stato della spedizione, comunicazioni tecniche.</li>
                    <li><strong className="text-foreground">Marketing (previo consenso):</strong> invio di newsletter, promozioni e comunicazioni commerciali.</li>
                    <li><strong className="text-foreground">Obblighi legali:</strong> adempimento di obblighi fiscali, contabili e normativi.</li>
                    <li><strong className="text-foreground">Miglioramento servizi:</strong> analisi statistiche anonime per migliorare l'esperienza utente.</li>
                  </ul>
                </div>
              </section>

              <section id="base-giuridica" className="mb-12">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <FileText className="h-5 w-5 text-primary" />
                  </div>
                  <h2 className="text-2xl font-bold m-0">4. Base Giuridica</h2>
                </div>
                <div className="pl-[52px] space-y-4 text-muted-foreground">
                  <p>Il trattamento dei dati personali si basa su:</p>
                  <ul className="space-y-2">
                    <li>• <strong className="text-foreground">Art. 6(1)(b) GDPR:</strong> esecuzione di un contratto o misure precontrattuali</li>
                    <li>• <strong className="text-foreground">Art. 6(1)(a) GDPR:</strong> consenso dell'interessato per finalità di marketing</li>
                    <li>• <strong className="text-foreground">Art. 6(1)(c) GDPR:</strong> adempimento di obblighi legali</li>
                    <li>• <strong className="text-foreground">Art. 6(1)(f) GDPR:</strong> legittimo interesse del titolare</li>
                  </ul>
                </div>
              </section>

              <section id="conservazione" className="mb-12">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <Server className="h-5 w-5 text-primary" />
                  </div>
                  <h2 className="text-2xl font-bold m-0">5. Conservazione dei Dati</h2>
                </div>
                <div className="pl-[52px] space-y-4 text-muted-foreground">
                  <p>I dati personali sono conservati per il tempo strettamente necessario alle finalità per cui sono stati raccolti:</p>
                  <div className="bg-secondary/30 rounded-lg p-4">
                    <ul className="space-y-2 text-sm">
                      <li><strong className="text-foreground">Dati contrattuali:</strong> 10 anni dalla conclusione del rapporto (obblighi fiscali)</li>
                      <li><strong className="text-foreground">Dati di marketing:</strong> fino alla revoca del consenso</li>
                      <li><strong className="text-foreground">Dati di navigazione:</strong> 24 mesi</li>
                      <li><strong className="text-foreground">Cookie:</strong> secondo la durata specificata nella Cookie Policy</li>
                    </ul>
                  </div>
                </div>
              </section>

              <section id="diritti" className="mb-12">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <UserCheck className="h-5 w-5 text-primary" />
                  </div>
                  <h2 className="text-2xl font-bold m-0">6. Diritti dell'Interessato</h2>
                </div>
                <div className="pl-[52px] space-y-4 text-muted-foreground">
                  <p>Ai sensi degli articoli 15-22 del GDPR, l'interessato ha diritto di:</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {[
                      'Accesso ai propri dati',
                      'Rettifica dei dati inesatti',
                      'Cancellazione dei dati',
                      'Limitazione del trattamento',
                      'Portabilità dei dati',
                      'Opposizione al trattamento',
                      'Revoca del consenso',
                      'Reclamo al Garante Privacy'
                    ].map((right, index) => (
                      <div key={index} className="flex items-center gap-2 bg-secondary/30 rounded-lg px-4 py-2 text-sm">
                        <div className="w-2 h-2 rounded-full bg-primary"></div>
                        <span>{right}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </section>

              <section id="cookie" className="mb-12">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <Lock className="h-5 w-5 text-primary" />
                  </div>
                  <h2 className="text-2xl font-bold m-0">7. Cookie Policy</h2>
                </div>
                <div className="pl-[52px] space-y-4 text-muted-foreground">
                  <p>Questo sito utilizza cookie tecnici necessari al funzionamento e cookie analitici per migliorare l'esperienza utente. Per maggiori informazioni, consulta la nostra Cookie Policy dettagliata.</p>
                  <div className="bg-secondary/30 rounded-lg p-4">
                    <h4 className="font-semibold text-foreground mb-2">Tipologie di cookie utilizzati:</h4>
                    <ul className="text-sm space-y-1">
                      <li>• <strong>Cookie tecnici:</strong> necessari per il funzionamento del sito</li>
                      <li>• <strong>Cookie di sessione:</strong> gestione del carrello e autenticazione</li>
                      <li>• <strong>Cookie analitici:</strong> statistiche anonime di navigazione</li>
                    </ul>
                  </div>
                </div>
              </section>

              <section id="contatti" className="mb-12">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <Mail className="h-5 w-5 text-primary" />
                  </div>
                  <h2 className="text-2xl font-bold m-0">8. Contatti</h2>
                </div>
                <div className="pl-[52px] space-y-4 text-muted-foreground">
                  <p>Per esercitare i propri diritti o per qualsiasi domanda relativa al trattamento dei dati personali, è possibile contattare il Titolare:</p>
                  <div className="flex flex-col sm:flex-row gap-4">
                    <a 
                      href="mailto:privacy@autonordservice.com"
                      className="inline-flex items-center justify-center h-11 px-6 rounded-lg bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors"
                    >
                      <Mail className="h-4 w-4 mr-2" />
                      privacy@autonordservice.com
                    </a>
                  </div>
                </div>
              </section>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
