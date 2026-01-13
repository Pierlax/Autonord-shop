import Link from 'next/link';
import { Facebook, Instagram, Linkedin, MapPin, Phone, Mail, Truck, Shield, Clock } from 'lucide-react';

export function Footer() {
  return (
    <footer className="bg-secondary text-secondary-foreground border-t border-border/10">
      {/* Trust Bar */}
      <div className="border-b border-border/10">
        <div className="container px-4 md:px-8 mx-auto py-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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
          </div>
        </div>
      </div>

      {/* Main Footer */}
      <div className="container px-4 md:px-8 mx-auto pt-12 pb-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-12 mb-12">
          {/* Company Info */}
          <div className="space-y-4">
            <h3 className="text-xl font-bold tracking-tight">
              AUTONORD <span className="text-primary">SERVICE</span>
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Dal 2006, il partner di fiducia per l'edilizia professionale. 
              Vendita, noleggio e assistenza tecnica specializzata.
            </p>
            <div className="flex space-x-3 pt-2">
              <Link href="#" className="w-9 h-9 rounded-full bg-muted/50 flex items-center justify-center text-muted-foreground hover:bg-primary hover:text-primary-foreground transition-colors">
                <Facebook className="h-4 w-4" />
              </Link>
              <Link href="#" className="w-9 h-9 rounded-full bg-muted/50 flex items-center justify-center text-muted-foreground hover:bg-primary hover:text-primary-foreground transition-colors">
                <Instagram className="h-4 w-4" />
              </Link>
              <Link href="#" className="w-9 h-9 rounded-full bg-muted/50 flex items-center justify-center text-muted-foreground hover:bg-primary hover:text-primary-foreground transition-colors">
                <Linkedin className="h-4 w-4" />
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

        {/* Bottom Bar */}
        <div className="border-t border-border/10 pt-8 flex flex-col md:flex-row justify-between items-center gap-4 text-xs text-muted-foreground">
          <p>&copy; {new Date().getFullYear()} Autonord Service S.r.l. - P.IVA 01234567890</p>
          <p className="flex items-center gap-1">
            Powered by <span className="font-medium">Next.js</span> & <span className="font-medium">Shopify</span>
          </p>
        </div>
      </div>
    </footer>
  );
}
