import Link from 'next/link';
import { Facebook, Instagram, Linkedin, MapPin, Phone, Mail } from 'lucide-react';

export function Footer() {
  return (
    <footer className="bg-secondary text-secondary-foreground pt-12 pb-6 border-t border-border/10">
      <div className="container px-4 md:px-8 mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-12">
          {/* Company Info */}
          <div className="space-y-4">
            <h3 className="text-xl font-bold tracking-tight text-primary">AUTONORD SERVICE</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Dal 2006, il partner di fiducia per l'edilizia professionale. 
              Vendita, noleggio e assistenza tecnica specializzata.
            </p>
            <div className="flex space-x-4 pt-2">
              <Link href="#" className="text-muted-foreground hover:text-primary transition-colors">
                <Facebook className="h-5 w-5" />
              </Link>
              <Link href="#" className="text-muted-foreground hover:text-primary transition-colors">
                <Instagram className="h-5 w-5" />
              </Link>
              <Link href="#" className="text-muted-foreground hover:text-primary transition-colors">
                <Linkedin className="h-5 w-5" />
              </Link>
            </div>
          </div>

          {/* Quick Links */}
          <div className="space-y-4">
            <h4 className="text-sm font-semibold uppercase tracking-wider">Navigazione</h4>
            <ul className="space-y-2 text-sm">
              <li><Link href="/products" className="text-muted-foreground hover:text-primary transition-colors">Catalogo Prodotti</Link></li>
              <li><Link href="/about" className="text-muted-foreground hover:text-primary transition-colors">Chi Siamo</Link></li>
              <li><Link href="/services" className="text-muted-foreground hover:text-primary transition-colors">Noleggio & Assistenza</Link></li>
              <li><Link href="/contact" className="text-muted-foreground hover:text-primary transition-colors">Contatti</Link></li>
            </ul>
          </div>

          {/* Support */}
          <div className="space-y-4">
            <h4 className="text-sm font-semibold uppercase tracking-wider">Supporto Clienti</h4>
            <ul className="space-y-2 text-sm">
              <li><Link href="/shipping" className="text-muted-foreground hover:text-primary transition-colors">Spedizioni e Resi</Link></li>
              <li><Link href="/warranty" className="text-muted-foreground hover:text-primary transition-colors">Garanzia Prodotti</Link></li>
              <li><Link href="/privacy" className="text-muted-foreground hover:text-primary transition-colors">Privacy Policy</Link></li>
              <li><Link href="/terms" className="text-muted-foreground hover:text-primary transition-colors">Termini e Condizioni</Link></li>
            </ul>
          </div>

          {/* Contact */}
          <div className="space-y-4">
            <h4 className="text-sm font-semibold uppercase tracking-wider">Contatti</h4>
            <ul className="space-y-3 text-sm">
              <li className="flex items-start gap-3">
                <MapPin className="h-5 w-5 text-primary shrink-0" />
                <span className="text-muted-foreground">Lungobisagno d'Istria 34,<br />16141 Genova (GE)</span>
              </li>
              <li className="flex items-center gap-3">
                <Phone className="h-5 w-5 text-primary shrink-0" />
                <a href="tel:0107456076" className="text-muted-foreground hover:text-primary transition-colors">010 7456076</a>
              </li>
              <li className="flex items-center gap-3">
                <Mail className="h-5 w-5 text-primary shrink-0" />
                <a href="mailto:info@autonordservice.com" className="text-muted-foreground hover:text-primary transition-colors">info@autonordservice.com</a>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-border/10 pt-6 flex flex-col md:flex-row justify-between items-center gap-4 text-xs text-muted-foreground">
          <p>&copy; {new Date().getFullYear()} Autonord Service S.r.l. - P.IVA 01234567890</p>
          <p>Powered by Next.js & Shopify</p>
        </div>
      </div>
    </footer>
  );
}
