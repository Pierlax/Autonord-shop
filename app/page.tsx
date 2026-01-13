import Link from 'next/link';
import { ArrowRight, CheckCircle, Truck, Shield, Clock, Phone, CreditCard, Award } from 'lucide-react';
import { getProducts } from '@/lib/shopify';
import { ProductCard } from '@/components/product/product-card';
import { PromoBanners } from '@/components/ui/promo-banners';
import { FeaturedCategories } from '@/components/ui/featured-categories';
import { BrandLogos } from '@/components/ui/brand-logos';
import { NewsletterSection } from '@/components/ui/newsletter-section';

export default async function Home() {
  const products = await getProducts('BEST_SELLING');

  return (
    <div className="flex flex-col pb-16">
      {/* Hero Section - National Leader Style */}
      <section className="relative w-full h-[550px] md:h-[600px] bg-slate-900 flex items-center overflow-hidden">
        <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1504307651254-35680f356dfd?q=80&w=2070&auto=format&fit=crop')] bg-cover bg-center opacity-40 mix-blend-overlay"></div>
        <div className="absolute inset-0 bg-gradient-to-r from-slate-950 via-slate-900/80 to-transparent"></div>
        
        <div className="container relative z-10 px-4 md:px-8">
          <div className="max-w-3xl space-y-6 animate-in fade-in slide-in-from-bottom-8 duration-1000">
            <div className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-sm font-medium text-primary backdrop-blur-sm">
              <span className="flex h-2 w-2 rounded-full bg-primary mr-2 animate-pulse"></span>
              PIATTAFORMA LEADER PER L'EDILIZIA
            </div>
            <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold tracking-tight text-white font-heading leading-tight">
              COSTRUISCI <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-blue-400">SENZA LIMITI</span>
            </h1>
            <p className="text-lg md:text-xl text-slate-300 max-w-xl leading-relaxed">
              Oltre 5.000 prodotti professionali in pronta consegna. 
              La logistica più avanzata d'Italia al servizio del tuo cantiere.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 pt-4">
              <Link 
                href="/products" 
                className="inline-flex h-12 items-center justify-center rounded-md bg-primary px-8 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                VAI AL CATALOGO
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
              <Link 
                href="/contact" 
                className="inline-flex h-12 items-center justify-center rounded-md border border-slate-700 bg-slate-800/50 px-8 text-sm font-medium text-white shadow-sm backdrop-blur-sm transition-colors hover:bg-slate-800 hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                PROGRAMMA B2B
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Trust Indicators Bar - Sirio Style */}
      <section className="bg-muted/50 border-y border-border/40">
        <div className="container px-4 md:px-8">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 py-6">
            <div className="flex items-center gap-3 justify-center md:justify-start">
              <Truck className="h-5 w-5 text-primary shrink-0" />
              <div className="text-xs md:text-sm">
                <span className="font-semibold block">Spedizione Gratuita</span>
                <span className="text-muted-foreground">da €300</span>
              </div>
            </div>
            <div className="flex items-center gap-3 justify-center md:justify-start">
              <Phone className="h-5 w-5 text-primary shrink-0" />
              <div className="text-xs md:text-sm">
                <span className="font-semibold block">Assistenza Tecnica</span>
                <span className="text-muted-foreground">010 7456076</span>
              </div>
            </div>
            <div className="flex items-center gap-3 justify-center md:justify-start">
              <Shield className="h-5 w-5 text-primary shrink-0" />
              <div className="text-xs md:text-sm">
                <span className="font-semibold block">Garanzia Italiana</span>
                <span className="text-muted-foreground">Prodotti originali</span>
              </div>
            </div>
            <div className="flex items-center gap-3 justify-center md:justify-start">
              <CreditCard className="h-5 w-5 text-primary shrink-0" />
              <div className="text-xs md:text-sm">
                <span className="font-semibold block">Pagamenti Sicuri</span>
                <span className="text-muted-foreground">Anche contrassegno</span>
              </div>
            </div>
            <div className="flex items-center gap-3 justify-center md:justify-start col-span-2 md:col-span-1">
              <Award className="h-5 w-5 text-primary shrink-0" />
              <div className="text-xs md:text-sm">
                <span className="font-semibold block">Dal 2006</span>
                <span className="text-muted-foreground">18+ anni di esperienza</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Promotional Banners Carousel */}
      <PromoBanners />

      {/* Featured Categories */}
      <FeaturedCategories />

      {/* Featured Products */}
      <section className="container px-4 md:px-8 py-12">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight font-heading">SCELTI DAI PROFESSIONISTI</h2>
            <p className="text-muted-foreground mt-1">I prodotti più richiesti dai cantieri italiani.</p>
          </div>
          <Link href="/products" className="text-primary font-medium hover:underline flex items-center gap-1">
            Vedi tutti <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {products.length > 0 ? (
            products.slice(0, 8).map((product) => (
              <ProductCard key={product.id} product={product} />
            ))
          ) : (
            // Fallback skeleton if no products
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-[400px] rounded-lg bg-muted animate-pulse"></div>
            ))
          )}
        </div>
      </section>

      {/* Brand Logos */}
      <BrandLogos />

      {/* B2B Banner */}
      <section className="container px-4 md:px-8 py-8">
        <div className="relative rounded-2xl overflow-hidden bg-slate-900 text-white">
          <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1581094794329-cd1361dca687?q=80&w=2000&auto=format&fit=crop')] bg-cover bg-center opacity-20"></div>
          <div className="relative z-10 p-8 md:p-12 flex flex-col md:flex-row items-center justify-between gap-8">
            <div className="max-w-xl space-y-4 text-center md:text-left">
              <span className="inline-block px-3 py-1 text-xs font-semibold uppercase tracking-wider bg-primary/20 text-primary rounded-full">
                Per Aziende e Professionisti
              </span>
              <h2 className="text-2xl md:text-4xl font-bold font-heading">SEI UN'AZIENDA?</h2>
              <p className="text-slate-300 text-base md:text-lg">
                Accedi al portale B2B riservato: listini personalizzati, fatturazione automatica e gestione ordini massivi.
              </p>
              <ul className="flex flex-wrap justify-center md:justify-start gap-4 text-sm text-slate-300">
                <li className="flex items-center gap-2"><CheckCircle className="h-4 w-4 text-primary" /> Prezzi netti riservati</li>
                <li className="flex items-center gap-2"><CheckCircle className="h-4 w-4 text-primary" /> Dilazione pagamento</li>
                <li className="flex items-center gap-2"><CheckCircle className="h-4 w-4 text-primary" /> Account manager</li>
              </ul>
            </div>
            <div>
              <Link 
                href="/contact" 
                className="inline-flex h-12 md:h-14 items-center justify-center rounded-md bg-white px-8 text-sm md:text-base font-bold text-slate-900 shadow hover:bg-slate-100 transition-colors"
              >
                RICHIEDI ACCESSO B2B
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Newsletter Section */}
      <NewsletterSection />
    </div>
  );
}
