import Link from 'next/link';
import { ArrowRight, CheckCircle, Truck, Shield, Clock, Phone, CreditCard, Award, BookOpen, AlertTriangle, Scale, DollarSign } from 'lucide-react';
import { getProductsAdmin } from '@/lib/shopify/products-admin';
import { ProductCard } from '@/components/product/product-card';
import { PromoBanners } from '@/components/ui/promo-banners';
import { FeaturedCategories } from '@/components/ui/featured-categories';
import { BrandLogos } from '@/components/ui/brand-logos';
import { NewsletterSection } from '@/components/ui/newsletter-section';
import { TeamTrust } from '@/components/ui/team-trust';

export default async function Home() {
  const products = await getProductsAdmin();

  return (
    <div className="flex flex-col pb-16">
      {/* Hero Section - TAYA Trust-Based Style */}
      <section className="relative w-full min-h-[550px] md:min-h-[600px] bg-slate-900 flex items-center overflow-hidden">
        <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1504307651254-35680f356dfd?q=80&w=2070&auto=format&fit=crop')] bg-cover bg-center opacity-30 mix-blend-overlay"></div>
        <div className="absolute inset-0 bg-gradient-to-r from-slate-950 via-slate-900/90 to-slate-900/70"></div>
        
        <div className="container relative z-10 px-4 md:px-8 py-12">
          <div className="max-w-4xl space-y-6 animate-in fade-in slide-in-from-bottom-8 duration-1000">
            {/* Autonord Service Logo - Official */}
            <div className="mb-4">
              <img 
                src="/autonord-logo.png" 
                alt="Autonord Service" 
                className="h-16 md:h-20 w-auto brightness-0 invert"
              />
              <span className="block text-sm text-slate-400 mt-2">Dal 2006 — Trasparenza e Competenza</span>
            </div>
            
            {/* Trust-Based Headline */}
            <h1 className="text-3xl md:text-5xl lg:text-6xl font-bold tracking-tight text-white font-heading leading-tight">
              L'unico sito di elettroutensili che ti dice la verità su{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-blue-400">
                prezzi, difetti e disponibilità.
              </span>
            </h1>
            
            {/* Trust Statement */}
            <p className="text-lg md:text-xl text-slate-300 max-w-2xl leading-relaxed">
              <strong className="text-white">Prima di comprare, informati qui.</strong>{' '}
              Niente marketing, solo guide oneste scritte da tecnici con 18 anni di esperienza in cantiere.
            </p>
            
            {/* Trust Proof Points */}
            <div className="flex flex-wrap gap-4 text-sm text-slate-400">
              <span className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-primary" />
                Prezzi reali, non gonfiati
              </span>
              <span className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-primary" />
                Confronti imparziali tra brand
              </span>
              <span className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-primary" />
                Ti diciamo anche quando NON comprare
              </span>
            </div>
            
            <div className="flex flex-col sm:flex-row gap-4 pt-4">
              <Link 
                href="/blog" 
                className="inline-flex h-12 items-center justify-center rounded-md bg-primary px-8 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <BookOpen className="mr-2 h-4 w-4" />
                LEGGI LE GUIDE
              </Link>
              <Link 
                href="/products" 
                className="inline-flex h-12 items-center justify-center rounded-md border border-slate-700 bg-slate-800/50 px-8 text-sm font-medium text-white shadow-sm backdrop-blur-sm transition-colors hover:bg-slate-800 hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                VAI AL CATALOGO
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* THE BIG 5 - Educational Content Section */}
      <section className="bg-gradient-to-b from-slate-900 to-background py-12 md:py-16">
        <div className="container px-4 md:px-8">
          <div className="text-center mb-10">
            <span className="inline-block px-3 py-1 text-xs font-semibold uppercase tracking-wider bg-primary/20 text-primary rounded-full mb-4">
              I "Big 5" — Le Domande che Tutti Fanno
            </span>
            <h2 className="text-2xl md:text-4xl font-bold tracking-tight font-heading text-white mb-3">
              Prima di Comprare, Leggi Questo
            </h2>
            <p className="text-slate-400 max-w-2xl mx-auto">
              Rispondiamo alle domande che i nostri clienti ci fanno ogni giorno. 
              Niente marketing, solo informazioni utili.
            </p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-6">
            {/* Card 1: Prezzi */}
            <Link 
              href="/blog/quanto-costa-attrezzare-furgone-elettricista-2026"
              className="group relative overflow-hidden rounded-xl bg-gradient-to-br from-emerald-900/50 to-emerald-950/50 border border-emerald-800/50 p-6 hover:border-emerald-600/50 transition-all duration-300"
            >
              <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-3xl group-hover:bg-emerald-500/20 transition-colors"></div>
              <div className="relative z-10">
                <div className="w-12 h-12 rounded-lg bg-emerald-500/20 flex items-center justify-center mb-4">
                  <DollarSign className="h-6 w-6 text-emerald-400" />
                </div>
                <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">Prezzi & Costi</span>
                <h3 className="text-xl font-bold text-white mt-2 mb-3 group-hover:text-emerald-400 transition-colors">
                  Guida Onesta ai Costi 2026: Perché Spendere di Più?
                </h3>
                <p className="text-slate-400 text-sm mb-4">
                  Quanto costa davvero attrezzare un furgone da elettricista? 
                  Analizziamo 3 livelli di budget: €3.500, €8.000 e €15.000+
                </p>
                <span className="inline-flex items-center text-sm font-medium text-emerald-400 group-hover:gap-2 transition-all">
                  Leggi la guida <ArrowRight className="ml-1 h-4 w-4" />
                </span>
              </div>
            </Link>
            
            {/* Card 2: Confronti */}
            <Link 
              href="/blog/milwaukee-vs-makita-vs-dewalt-confronto-definitivo-2026"
              className="group relative overflow-hidden rounded-xl bg-gradient-to-br from-blue-900/50 to-blue-950/50 border border-blue-800/50 p-6 hover:border-blue-600/50 transition-all duration-300"
            >
              <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl group-hover:bg-blue-500/20 transition-colors"></div>
              <div className="relative z-10">
                <div className="w-12 h-12 rounded-lg bg-blue-500/20 flex items-center justify-center mb-4">
                  <Scale className="h-6 w-6 text-blue-400" />
                </div>
                <span className="text-xs font-semibold text-blue-400 uppercase tracking-wider">Confronti</span>
                <h3 className="text-xl font-bold text-white mt-2 mb-3 group-hover:text-blue-400 transition-colors">
                  Milwaukee vs Makita vs DeWalt: Il Test in Cantiere
                </h3>
                <p className="text-slate-400 text-sm mb-4">
                  Confronto imparziale basato su test reali e opinioni di professionisti da Reddit e forum di settore.
                </p>
                <span className="inline-flex items-center text-sm font-medium text-blue-400 group-hover:gap-2 transition-all">
                  Leggi il confronto <ArrowRight className="ml-1 h-4 w-4" />
                </span>
              </div>
            </Link>
            
            {/* Card 3: Problemi */}
            <Link 
              href="/blog/5-motivi-tassellatore-surriscalda-soluzioni"
              className="group relative overflow-hidden rounded-xl bg-gradient-to-br from-amber-900/50 to-amber-950/50 border border-amber-800/50 p-6 hover:border-amber-600/50 transition-all duration-300"
            >
              <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 rounded-full blur-3xl group-hover:bg-amber-500/20 transition-colors"></div>
              <div className="relative z-10">
                <div className="w-12 h-12 rounded-lg bg-amber-500/20 flex items-center justify-center mb-4">
                  <AlertTriangle className="h-6 w-6 text-amber-400" />
                </div>
                <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider">Problemi & Soluzioni</span>
                <h3 className="text-xl font-bold text-white mt-2 mb-3 group-hover:text-amber-400 transition-colors">
                  5 Errori che Distruggono i Tuoi Elettroutensili
                </h3>
                <p className="text-slate-400 text-sm mb-4">
                  Perché il tuo tassellatore si surriscalda? Come evitare danni costosi? 
                  Parliamo dei problemi che nessuno ammette.
                </p>
                <span className="inline-flex items-center text-sm font-medium text-amber-400 group-hover:gap-2 transition-all">
                  Scopri le soluzioni <ArrowRight className="ml-1 h-4 w-4" />
                </span>
              </div>
            </Link>
          </div>
          
          {/* CTA to full blog */}
          <div className="text-center mt-8">
            <Link 
              href="/blog" 
              className="inline-flex items-center text-sm font-medium text-primary hover:underline"
            >
              Vedi tutte le guide e i confronti ({'>'}20 articoli)
              <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Trust Indicators Bar */}
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
              <ProductCard key={product.id} product={product} showExpertTake={true} />
            ))
          ) : (
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

      {/* Team Trust Section - Humanized */}
      <TeamTrust />

      {/* Newsletter Section */}
      <NewsletterSection />
    </div>
  );
}
