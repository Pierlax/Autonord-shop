import { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Check, FileText, Truck, Shield, ChevronRight, Package, Clock, Phone, MessageCircle, Sparkles, ExternalLink } from 'lucide-react';
import { getProductByHandleAdmin } from '@/lib/shopify/products-admin';
import { AddToCartButton, StickyMobileCTA } from '@/components/product/add-to-cart';
import { ProductFAQ } from '@/components/product/product-faq';
import { VideoGallery } from '@/components/product/video-gallery';
import { CustomerQuestion } from '@/components/product/customer-question';
import { RelatedArticles } from '@/components/product/related-articles';
import { toTitleCase, getBrandName } from '@/lib/utils';

type Props = {
  params: { handle: string };
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const product = await getProductByHandleAdmin(params.handle);

  if (!product) {
    return {
      title: 'Prodotto non trovato',
    };
  }

  return {
    title: `${toTitleCase(product.title)} | Autonord Service`,
    description: product.description.substring(0, 160).replace(/<[^>]*>?/gm, ''),
    openGraph: {
      images: [product.featuredImage?.url || ''],
    },
  };
}

// Check if product has AI-enhanced content
function hasAIContent(descriptionHtml: string | null | undefined): boolean {
  if (!descriptionHtml) return false;
  return descriptionHtml.includes('product-description') || 
         descriptionHtml.includes('expert-opinion') ||
         descriptionHtml.includes('Opinione dell\'Esperto');
}

export default async function ProductPage({ params }: Props) {
  const product = await getProductByHandleAdmin(params.handle);

  if (!product) {
    notFound();
  }

  const isB2B = product.tags.includes('B2B') || product.tags.includes('Richiedi Preventivo');
  const isOutOfStock = product.totalInventory <= 0;
  const isLowStock = product.totalInventory > 0 && product.totalInventory < 5;
  const price = parseFloat(product.priceRange.minVariantPrice.amount);
  const currency = product.priceRange.minVariantPrice.currencyCode;
  
  const brandName = getBrandName(product.vendor);
  const productTitleFormatted = toTitleCase(product.title);
  const isAIEnhanced = hasAIContent(product.descriptionHtml);
  
  const formattedPrice = new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: currency,
  }).format(price);

  // Generate competitor price estimates
  const competitorPrices = [
    { name: 'Amazon', price: `€${(price * 1.05).toFixed(0)}`, url: `https://www.amazon.it/s?k=${encodeURIComponent(product.title)}` },
    { name: 'Leroy Merlin', price: `€${(price * 1.08).toFixed(0)}`, url: `https://www.leroymerlin.it/search?query=${encodeURIComponent(product.title)}` },
  ];

  // Product Schema Markup
  const productSchema = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: productTitleFormatted,
    description: product.description,
    image: product.featuredImage?.url,
    brand: {
      '@type': 'Brand',
      name: brandName,
    },
    sku: product.variants.edges[0]?.node.sku,
    offers: {
      '@type': 'Offer',
      url: `https://autonord-shop.vercel.app/products/${params.handle}`,
      priceCurrency: currency,
      price: price,
      availability: isOutOfStock 
        ? 'https://schema.org/PreOrder' 
        : 'https://schema.org/InStock',
      seller: {
        '@type': 'Organization',
        name: 'Autonord Service',
      },
    },
  };

  // Stock status component
  const StockStatus = () => {
    if (isOutOfStock) {
      return (
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-500/10 text-amber-400 text-sm font-medium border border-amber-500/20">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
            Su ordinazione
          </span>
          <span className="text-xs text-muted-foreground">5-7 giorni lavorativi</span>
        </div>
      );
    }
    if (isLowStock) {
      return (
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-orange-500/10 text-orange-400 text-sm font-medium border border-orange-500/20">
            <Clock className="w-3.5 h-3.5" />
            Ultimi {product.totalInventory} pezzi
          </span>
        </div>
      );
    }
    return (
      <div className="flex items-center gap-2">
        <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/10 text-emerald-400 text-sm font-medium border border-emerald-500/20">
          <Check className="w-3.5 h-3.5" />
          Disponibile
        </span>
        <span className="text-xs text-muted-foreground">Spedizione in 24/48h</span>
      </div>
    );
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(productSchema) }}
      />

      <div className="container px-4 md:px-8 py-6 md:py-10 pb-24 md:pb-10">
        {/* Breadcrumbs */}
        <nav className="flex items-center text-sm text-muted-foreground mb-6 overflow-x-auto">
          <Link href="/" className="hover:text-primary transition-colors whitespace-nowrap">Home</Link>
          <ChevronRight className="h-4 w-4 mx-2 flex-shrink-0" />
          <Link href="/products" className="hover:text-primary transition-colors whitespace-nowrap">Prodotti</Link>
          <ChevronRight className="h-4 w-4 mx-2 flex-shrink-0" />
          {product.vendor && (
            <>
              <Link href={`/products?vendor=${encodeURIComponent(product.vendor)}`} className="hover:text-primary transition-colors whitespace-nowrap">
                {brandName}
              </Link>
              <ChevronRight className="h-4 w-4 mx-2 flex-shrink-0" />
            </>
          )}
          <span className="text-foreground font-medium truncate max-w-[200px]">{productTitleFormatted}</span>
        </nav>

        {/* Main Grid - Product Info + Purchase */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 lg:gap-12 mb-12">
          
          {/* Left Column - Image Gallery */}
          <div className="lg:col-span-1 space-y-4">
            <div className="aspect-square relative overflow-hidden rounded-xl border border-border bg-white p-6 sticky top-24">
              {product.featuredImage ? (
                <Image
                  src={product.featuredImage.url}
                  alt={product.featuredImage.altText || product.title}
                  fill
                  className="object-contain"
                  priority
                />
              ) : (
                <div className="h-full w-full flex items-center justify-center bg-muted text-muted-foreground">
                  <Package className="w-16 h-16 opacity-30" />
                </div>
              )}
              
              {/* AI Enhanced Badge */}
              {isAIEnhanced && (
                <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-violet-500/20 border border-violet-500/30 backdrop-blur-sm">
                  <Sparkles className="h-3.5 w-3.5 text-violet-400" />
                  <span className="text-xs font-medium text-violet-300">Scheda Arricchita</span>
                </div>
              )}
            </div>
            
            {/* Thumbnail gallery */}
            {product.images?.edges && product.images.edges.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-2">
                {product.images.edges.slice(0, 5).map((img, i) => (
                  <div key={i} className="w-16 h-16 flex-shrink-0 rounded-lg border border-border bg-white p-1.5 cursor-pointer hover:border-primary transition-colors">
                    <Image
                      src={img.node.url}
                      alt={img.node.altText || `${product.title} - Immagine ${i + 1}`}
                      width={64}
                      height={64}
                      className="w-full h-full object-contain"
                    />
                  </div>
                ))}
              </div>
            )}
            
            {/* Video Gallery */}
            <VideoGallery productTitle={product.title} brand={brandName} />
          </div>

          {/* Center Column - Product Content (Article Style) */}
          <div className="lg:col-span-2 space-y-8">
            
            {/* Header */}
            <div>
              <div className="flex items-center gap-3 mb-3">
                <span className="text-sm font-bold text-primary tracking-wider uppercase">{brandName}</span>
                <span className="text-muted-foreground">•</span>
                <span className="text-sm text-muted-foreground font-mono">SKU: {product.variants.edges[0]?.node.sku || 'N/A'}</span>
              </div>
              
              <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold text-foreground mb-4 leading-tight">
                {productTitleFormatted}
              </h1>
              
              <StockStatus />
            </div>

            {/* Price Card - Compact */}
            <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border border-primary/20 rounded-xl p-5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="flex items-baseline gap-2 mb-1">
                    <span className="text-3xl font-bold text-foreground">{formattedPrice}</span>
                    <span className="text-sm text-muted-foreground">+ IVA</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>Confronta:</span>
                    {competitorPrices.map((cp, i) => (
                      <a 
                        key={i}
                        href={cp.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-primary transition-colors inline-flex items-center gap-1"
                      >
                        {cp.price} su {cp.name}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    ))}
                  </div>
                </div>
                
                {isB2B ? (
                  <button className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-6 py-3 text-sm font-bold text-white shadow hover:bg-blue-700 transition-colors">
                    <FileText className="mr-2 h-4 w-4" />
                    RICHIEDI PREVENTIVO
                  </button>
                ) : (
                  <AddToCartButton 
                    variantId={product.variants.edges[0]?.node.id} 
                    available={!isOutOfStock}
                    productTitle={productTitleFormatted}
                  />
                )}
              </div>
            </div>

            {/* Main Content - AI Generated Description as Article */}
            {product.descriptionHtml && (
              <article className="prose prose-invert prose-lg max-w-none">
                <div 
                  dangerouslySetInnerHTML={{ __html: product.descriptionHtml }} 
                  className="
                    [&_.product-description]:space-y-6
                    [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:text-foreground [&_h2]:mt-0 [&_h2]:mb-4
                    [&_h3]:text-xl [&_h3]:font-semibold [&_h3]:text-foreground [&_h3]:mt-8 [&_h3]:mb-4
                    [&_p]:text-muted-foreground [&_p]:leading-relaxed [&_p]:mb-4
                    [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:space-y-2 [&_ul]:mb-6
                    [&_li]:text-muted-foreground
                    [&_strong]:text-foreground [&_strong]:font-semibold
                    [&_cite]:italic [&_cite]:text-muted-foreground/80
                    [&_.product-features]:bg-muted/30 [&_.product-features]:rounded-xl [&_.product-features]:p-6 [&_.product-features]:border [&_.product-features]:border-border/50
                    [&_.product-features_h3]:text-lg [&_.product-features_h3]:mt-0
                    [&_.product-specs]:bg-muted/30 [&_.product-specs]:rounded-xl [&_.product-specs]:p-6 [&_.product-specs]:border [&_.product-specs]:border-border/50
                    [&_.product-specs_h3]:text-lg [&_.product-specs_h3]:mt-0
                    [&_.product-usecases]:bg-muted/30 [&_.product-usecases]:rounded-xl [&_.product-usecases]:p-6 [&_.product-usecases]:border [&_.product-usecases]:border-border/50
                    [&_.product-usecases_h3]:text-lg [&_.product-usecases_h3]:mt-0
                    [&_.expert-opinion]:bg-gradient-to-br [&_.expert-opinion]:from-amber-500/10 [&_.expert-opinion]:to-orange-500/10 [&_.expert-opinion]:rounded-xl [&_.expert-opinion]:p-6 [&_.expert-opinion]:border [&_.expert-opinion]:border-amber-500/20 [&_.expert-opinion]:mt-8
                    [&_.expert-opinion_h3]:text-lg [&_.expert-opinion_h3]:mt-0 [&_.expert-opinion_h3]:text-amber-400 [&_.expert-opinion_h3]:flex [&_.expert-opinion_h3]:items-center [&_.expert-opinion_h3]:gap-2
                    [&_.expert-opinion_p]:text-foreground/90
                  "
                />
              </article>
            )}

            {/* If no AI content, show basic description */}
            {!product.descriptionHtml && product.description && (
              <div className="prose prose-invert max-w-none">
                <p className="text-muted-foreground leading-relaxed">{product.description}</p>
              </div>
            )}

            {/* Value Props */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="flex items-start gap-3 p-4 rounded-xl bg-muted/30 border border-border/50">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Truck className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h4 className="font-semibold text-sm">Spedizione Rapida</h4>
                  <p className="text-xs text-muted-foreground">24/48h in tutta Italia</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-4 rounded-xl bg-muted/30 border border-border/50">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Shield className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h4 className="font-semibold text-sm">Garanzia Ufficiale</h4>
                  <p className="text-xs text-muted-foreground">2 anni + assistenza diretta</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-4 rounded-xl bg-muted/30 border border-border/50">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Phone className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h4 className="font-semibold text-sm">Supporto Tecnico</h4>
                  <p className="text-xs text-muted-foreground">010 7456076</p>
                </div>
              </div>
            </div>

            {/* Related Articles */}
            <RelatedArticles 
              productTitle={productTitleFormatted}
              brandName={brandName}
              productTags={product.tags}
            />

            {/* FAQ Section */}
            <ProductFAQ 
              productTitle={productTitleFormatted}
              brandName={brandName}
            />
            
            {/* Customer Question */}
            <CustomerQuestion 
              productTitle={productTitleFormatted}
              productHandle={params.handle}
            />
          </div>
        </div>

        {/* Contact CTA */}
        <div className="bg-muted/30 border border-border rounded-xl p-6 md:p-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div>
              <h3 className="text-xl font-bold mb-2">Hai domande su questo prodotto?</h3>
              <p className="text-muted-foreground">I nostri tecnici sono a disposizione per consulenze gratuite.</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <a 
                href="https://wa.me/393..." 
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-600 text-white font-medium hover:bg-emerald-700 transition-colors"
              >
                <MessageCircle className="h-4 w-4" />
                WhatsApp
              </a>
              <a 
                href="tel:0107456076" 
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors"
              >
                <Phone className="h-4 w-4" />
                010 7456076
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Sticky Mobile CTA */}
      {!isB2B && (
        <StickyMobileCTA 
          variantId={product.variants.edges[0]?.node.id}
          available={!isOutOfStock}
          price={formattedPrice}
          productTitle={productTitleFormatted}
        />
      )}
    </>
  );
}
