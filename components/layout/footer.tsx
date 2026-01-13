import Link from 'next/link';
import Image from 'next/image';
import { Facebook, Instagram, Linkedin, Youtube, MapPin, Phone, Mail, Truck, Shield, Clock, CreditCard, BookOpen, Award } from 'lucide-react';

export function Footer() {
  return (
    <footer className="bg-secondary text-secondary-foreground border-t border-border/10">
      {/* Trust Bar */}
      <div className="border-b border-border/10">
        <div className="container px-4 md:px-8 mx-auto py-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Truck className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-semibold text-sm">Spedizione Rapida</p>
                <p className="text-xs text-muted-foreground">Consegna in 24/48h</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Shield className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-semibold text-sm">Garanzia Ufficiale</p>
                <p className="text-xs text-muted-foreground">2 anni su tutti i prodotti</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Clock className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-semibold text-sm">Assistenza Dedicata</p>
                <p className="text-xs text-muted-foreground">Supporto tecnico specializzato</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <CreditCard className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-semibold text-sm">Pagamenti Sicuri</p>
                <p className="text-xs text-muted-foreground">Carta, PayPal, Bonifico</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Footer */}
      <div className="container px-4 md:px-8 mx-auto pt-12 pb-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-8 lg:gap-8 mb-12">
          {/* Company Info */}
          <div className="space-y-4 lg:col-span-2">
            <h3 className="text-xl font-bold tracking-tight">
              AUTONORD <span className="text-primary">SERVICE</span>
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Dal 2006, il partner di fiducia per l'edilizia professionale a Genova e provincia. 
              Vendita, noleggio e assistenza tecnica specializzata per elettroutensili e macchine movimento terra.
            </p>
            
            {/* Exclusive Dealer Badge */}
            <div className="flex items-center gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
              <Award className="h-5 w-5 text-amber-500 shrink-0" />
              <p className="text-xs text-amber-200">
                <strong>Concessionario Esclusivo Yanmar</strong><br />
                per la Provincia di Genova
              </p>
            </div>
            
            <div className="flex space-x-3 pt-2">
              <Link href="https://facebook.com" target="_blank" className="w-9 h-9 rounded-full bg-muted/50 flex items-center justify-center text-muted-foreground hover:bg-[#1877F2] hover:text-white transition-colors">
                <Facebook className="h-4 w-4" />
              </Link>
              <Link href="https://instagram.com" target="_blank" className="w-9 h-9 rounded-full bg-muted/50 flex items-center justify-center text-muted-foreground hover:bg-[#E4405F] hover:text-white transition-colors">
                <Instagram className="h-4 w-4" />
              </Link>
              <Link href="https://linkedin.com" target="_blank" className="w-9 h-9 rounded-full bg-muted/50 flex items-center justify-center text-muted-foreground hover:bg-[#0A66C2] hover:text-white transition-colors">
                <Linkedin className="h-4 w-4" />
              </Link>
              <Link href="https://youtube.com" target="_blank" className="w-9 h-9 rounded-full bg-muted/50 flex items-center justify-center text-muted-foreground hover:bg-[#FF0000] hover:text-white transition-colors">
                <Youtube className="h-4 w-4" />
              </Link>
            </div>
          </div>

          {/* Quick Links */}
          <div className="space-y-4">
            <h4 className="text-sm font-semibold uppercase tracking-wider">Navigazione</h4>
            <ul className="space-y-3 text-sm">
              <li><Link href="/products" className="text-muted-foreground hover:text-primary transition-colors">Catalogo Prodotti</Link></li>
              <li><Link href="/about" className="text-muted-foreground hover:text-primary transition-colors">Chi Siamo</Link></li>
              <li><Link href="/services" className="text-muted-foreground hover:text-primary transition-colors">Noleggio & Assistenza</Link></li>
              <li><Link href="/contact" className="text-muted-foreground hover:text-primary transition-colors">Contatti</Link></li>
            </ul>
          </div>

          {/* Risorse Utili */}
          <div className="space-y-4">
            <h4 className="text-sm font-semibold uppercase tracking-wider flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-primary" />
              Risorse Utili
            </h4>
            <ul className="space-y-3 text-sm">
              <li><Link href="/blog" className="text-muted-foreground hover:text-primary transition-colors">Blog & Guide</Link></li>
              <li><Link href="/blog/quanto-costa-attrezzare-furgone-elettricista-2026" className="text-muted-foreground hover:text-primary transition-colors">Guida Prezzi 2026</Link></li>
              <li><Link href="/blog/milwaukee-vs-makita-vs-dewalt-confronto-definitivo-2026" className="text-muted-foreground hover:text-primary transition-colors">Milwaukee vs Makita</Link></li>
              <li><Link href="/blog/migliori-avvitatori-impulsi-gommisti-2026" className="text-muted-foreground hover:text-primary transition-colors">Migliori Avvitatori</Link></li>
            </ul>
          </div>

          {/* Support */}
          <div className="space-y-4">
            <h4 className="text-sm font-semibold uppercase tracking-wider">Supporto Clienti</h4>
            <ul className="space-y-3 text-sm">
              <li><Link href="/shipping" className="text-muted-foreground hover:text-primary transition-colors">Spedizioni e Resi</Link></li>
              <li><Link href="/warranty" className="text-muted-foreground hover:text-primary transition-colors">Garanzia Prodotti</Link></li>
              <li><Link href="/privacy" className="text-muted-foreground hover:text-primary transition-colors">Privacy Policy</Link></li>
              <li><Link href="/terms" className="text-muted-foreground hover:text-primary transition-colors">Termini e Condizioni</Link></li>
            </ul>
          </div>

          {/* Contact */}
          <div className="space-y-4">
            <h4 className="text-sm font-semibold uppercase tracking-wider">Contatti</h4>
            <ul className="space-y-4 text-sm">
              <li className="flex items-start gap-3">
                <MapPin className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                <span className="text-muted-foreground">Lungobisagno d'Istria 34,<br />16141 Genova (GE)</span>
              </li>
              <li className="flex items-center gap-3">
                <Phone className="h-5 w-5 text-primary shrink-0" />
                <a href="tel:0107456076" className="text-muted-foreground hover:text-primary transition-colors font-medium">010 7456076</a>
              </li>
              <li className="flex items-center gap-3">
                <Mail className="h-5 w-5 text-primary shrink-0" />
                <a href="mailto:info@autonordservice.com" className="text-muted-foreground hover:text-primary transition-colors">info@autonordservice.com</a>
              </li>
            </ul>
          </div>
        </div>

        {/* Payment Methods */}
        <div className="border-t border-border/10 pt-8 mb-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">Metodi di pagamento accettati:</p>
            <div className="flex items-center gap-3">
              <span className="px-3 py-1.5 bg-muted/50 rounded text-xs font-medium">Visa</span>
              <span className="px-3 py-1.5 bg-muted/50 rounded text-xs font-medium">Mastercard</span>
              <span className="px-3 py-1.5 bg-[#003087] text-white rounded text-xs font-medium">PayPal</span>
              <span className="px-3 py-1.5 bg-muted/50 rounded text-xs font-medium">Bonifico</span>
              <span className="px-3 py-1.5 bg-muted/50 rounded text-xs font-medium">Contrassegno</span>
            </div>
          </div>
        </div>

        {/* EU Funding Badge */}
        <div className="border-t border-border/10 pt-6 mb-6">
          <div className="flex flex-col md:flex-row items-center justify-center gap-4 p-4 bg-blue-950/30 border border-blue-800/30 rounded-lg">
            <div className="flex items-center gap-3">
              <div className="w-12 h-8 bg-[#003399] rounded flex items-center justify-center">
                <span className="text-[#FFCC00] text-lg">★</span>
              </div>
              <div className="h-8 w-px bg-border/30"></div>
              <Image 
                src="/images/regione-liguria.png" 
                alt="Regione Liguria" 
                width={60} 
                height={30}
                className="h-8 w-auto object-contain opacity-80"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
            </div>
            <p className="text-xs text-muted-foreground text-center md:text-left max-w-xl">
              Progetto cofinanziato con risorse del PR FESR Liguria 2021-2027 — Azione 1.2.3 
              "Supporto allo sviluppo di progetti di digitalizzazione nelle micro, piccole e medie imprese"
            </p>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="border-t border-border/10 pt-8 flex flex-col md:flex-row justify-between items-center gap-4 text-xs text-muted-foreground">
          <p>&copy; {new Date().getFullYear()} Autonord Service S.a.s. — P.IVA 02579430990 — Tutti i diritti riservati</p>
          <p className="flex items-center gap-1">
            Powered by <span className="font-medium">Next.js</span> & <span className="font-medium">Shopify</span>
          </p>
        </div>
      </div>
    </footer>
  );
}
