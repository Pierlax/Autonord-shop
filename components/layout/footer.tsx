import Link from 'next/link';
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

        {/* Bottom Bar with Payment Methods */}
        <div className="border-t border-border/10 pt-8">
          {/* Payment Methods - Centered and Improved */}
          <div className="flex flex-col items-center gap-4 mb-6">
            <p className="text-sm text-muted-foreground font-medium">Metodi di pagamento accettati</p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {/* Visa */}
              <div className="flex items-center gap-1.5 px-3 py-2 bg-white rounded-md">
                <svg className="h-5 w-8" viewBox="0 0 48 32" fill="none">
                  <rect width="48" height="32" rx="4" fill="white"/>
                  <path d="M19.5 21.5L21.5 10.5H24.5L22.5 21.5H19.5Z" fill="#1A1F71"/>
                  <path d="M32.5 10.7C31.9 10.5 31 10.3 29.9 10.3C26.9 10.3 24.8 11.8 24.8 14C24.8 15.6 26.3 16.5 27.4 17.1C28.6 17.7 29 18.1 29 18.6C29 19.4 28 19.8 27.1 19.8C25.8 19.8 25.1 19.6 24 19.1L23.5 18.9L23 21.7C23.8 22.1 25.2 22.4 26.7 22.4C29.9 22.4 31.9 20.9 31.9 18.6C31.9 17.3 31.1 16.3 29.4 15.5C28.4 15 27.8 14.6 27.8 14.1C27.8 13.6 28.4 13.1 29.6 13.1C30.6 13.1 31.3 13.3 31.9 13.5L32.2 13.6L32.5 10.7Z" fill="#1A1F71"/>
                  <path d="M37.5 10.5C36.9 10.5 36.4 10.7 36.1 11.3L31.5 21.5H34.7L35.3 19.8H39.2L39.6 21.5H42.5L40 10.5H37.5ZM36.2 17.5C36.4 17 37.5 14.1 37.5 14.1C37.5 14.1 37.8 13.3 38 12.8L38.2 14L39 17.5H36.2Z" fill="#1A1F71"/>
                  <path d="M17.5 10.5L14.5 18.1L14.2 16.8C13.6 15 11.9 13 10 12L12.7 21.5H16L21 10.5H17.5Z" fill="#1A1F71"/>
                  <path d="M12 10.5H7L6.9 10.7C10.6 11.6 13 13.9 14 16.8L12.9 11.3C12.7 10.7 12.2 10.5 12 10.5Z" fill="#F9A533"/>
                </svg>
              </div>
              {/* Mastercard */}
              <div className="flex items-center gap-1.5 px-3 py-2 bg-white rounded-md">
                <svg className="h-5 w-8" viewBox="0 0 48 32" fill="none">
                  <rect width="48" height="32" rx="4" fill="white"/>
                  <circle cx="18" cy="16" r="8" fill="#EB001B"/>
                  <circle cx="30" cy="16" r="8" fill="#F79E1B"/>
                  <path d="M24 10.5C25.9 12 27.1 14.3 27.1 16.9C27.1 19.5 25.9 21.8 24 23.3C22.1 21.8 20.9 19.5 20.9 16.9C20.9 14.3 22.1 12 24 10.5Z" fill="#FF5F00"/>
                </svg>
              </div>
              {/* PayPal */}
              <div className="flex items-center gap-1.5 px-3 py-2 bg-[#003087] rounded-md">
                <svg className="h-5 w-14" viewBox="0 0 80 24" fill="none">
                  <path d="M28.5 6H24.5C24.2 6 24 6.2 23.9 6.5L22 17.5C22 17.7 22.1 17.9 22.4 17.9H24.3C24.6 17.9 24.8 17.7 24.9 17.4L25.4 14.5C25.5 14.2 25.7 14 26 14H27.5C30.5 14 32.3 12.5 32.8 9.6C33 8.4 32.8 7.4 32.2 6.7C31.5 6.2 30.2 6 28.5 6ZM29 9.8C28.7 11.5 27.4 11.5 26.2 11.5H25.5L26 8.5C26 8.3 26.2 8.2 26.4 8.2H26.7C27.5 8.2 28.3 8.2 28.7 8.7C29 9 29.1 9.3 29 9.8Z" fill="white"/>
                  <path d="M42.5 9.7H40.6C40.4 9.7 40.2 9.8 40.2 10L40.1 10.5L40 10.3C39.5 9.6 38.4 9.4 37.3 9.4C34.7 9.4 32.5 11.3 32.1 14C31.9 15.3 32.2 16.6 33 17.5C33.7 18.3 34.7 18.7 35.9 18.7C38 18.7 39.2 17.4 39.2 17.4L39.1 17.9C39.1 18.1 39.2 18.3 39.5 18.3H41.2C41.5 18.3 41.7 18.1 41.8 17.8L42.9 10.2C43 10 42.8 9.7 42.5 9.7ZM39.8 14.1C39.6 15.4 38.5 16.3 37.2 16.3C36.5 16.3 36 16.1 35.7 15.7C35.4 15.3 35.3 14.7 35.4 14.1C35.6 12.8 36.7 11.9 38 11.9C38.7 11.9 39.2 12.1 39.5 12.5C39.8 12.9 39.9 13.5 39.8 14.1Z" fill="white"/>
                  <path d="M55.5 9.7H53.6C53.3 9.7 53.1 9.9 53 10.1L50.2 14.3L49 10.3C48.9 10 48.6 9.7 48.3 9.7H46.4C46.1 9.7 45.9 10 46 10.3L48.3 17.1L46.1 20.2C45.9 20.5 46.1 20.9 46.5 20.9H48.4C48.7 20.9 48.9 20.7 49 20.5L55.9 10.4C56.1 10.1 55.9 9.7 55.5 9.7Z" fill="white"/>
                  <path d="M62.5 6H58.5C58.2 6 58 6.2 57.9 6.5L56 17.5C56 17.7 56.1 17.9 56.4 17.9H58.5C58.7 17.9 58.8 17.8 58.9 17.6L59.4 14.5C59.5 14.2 59.7 14 60 14H61.5C64.5 14 66.3 12.5 66.8 9.6C67 8.4 66.8 7.4 66.2 6.7C65.5 6.2 64.2 6 62.5 6ZM63 9.8C62.7 11.5 61.4 11.5 60.2 11.5H59.5L60 8.5C60 8.3 60.2 8.2 60.4 8.2H60.7C61.5 8.2 62.3 8.2 62.7 8.7C63 9 63.1 9.3 63 9.8Z" fill="#009CDE"/>
                  <path d="M76.5 9.7H74.6C74.4 9.7 74.2 9.8 74.2 10L74.1 10.5L74 10.3C73.5 9.6 72.4 9.4 71.3 9.4C68.7 9.4 66.5 11.3 66.1 14C65.9 15.3 66.2 16.6 67 17.5C67.7 18.3 68.7 18.7 69.9 18.7C72 18.7 73.2 17.4 73.2 17.4L73.1 17.9C73.1 18.1 73.2 18.3 73.5 18.3H75.2C75.5 18.3 75.7 18.1 75.8 17.8L76.9 10.2C77 10 76.8 9.7 76.5 9.7ZM73.8 14.1C73.6 15.4 72.5 16.3 71.2 16.3C70.5 16.3 70 16.1 69.7 15.7C69.4 15.3 69.3 14.7 69.4 14.1C69.6 12.8 70.7 11.9 72 11.9C72.7 11.9 73.2 12.1 73.5 12.5C73.8 12.9 73.9 13.5 73.8 14.1Z" fill="#009CDE"/>
                </svg>
              </div>
              {/* Bonifico */}
              <div className="flex items-center gap-1.5 px-3 py-2 bg-muted/80 rounded-md">
                <span className="text-xs font-semibold text-foreground">Bonifico Bancario</span>
              </div>
              {/* Contrassegno */}
              <div className="flex items-center gap-1.5 px-3 py-2 bg-muted/80 rounded-md">
                <span className="text-xs font-semibold text-foreground">Contrassegno</span>
              </div>
            </div>
          </div>

          {/* Copyright */}
          <div className="flex flex-col md:flex-row justify-between items-center gap-4 text-xs text-muted-foreground pt-6 border-t border-border/10">
            <p>&copy; {new Date().getFullYear()} Autonord Service S.a.s. — P.IVA 02579430990 — Tutti i diritti riservati</p>
            <p className="flex items-center gap-1">
              Powered by <span className="font-medium">Next.js</span> & <span className="font-medium">Shopify</span>
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
