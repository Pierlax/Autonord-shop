import { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Check, AlertTriangle, FileText, Truck, Shield, ChevronRight, Package } from 'lucide-react';
import { getProductByHandle } from '@/lib/shopify';
import { AddToCartButton, StickyMobileCTA } from '@/components/product/add-to-cart';
import { ProductFAQ } from '@/components/product/product-faq';
import { ExpertReview } from '@/components/product/expert-review';
import { RelatedArticles } from '@/components/product/related-articles';
import { VideoGallery } from '@/components/product/video-gallery';
import { toTitleCase, getBrandName } from '@/lib/utils';

type Props = {
  params: { handle: string };
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const product = await getProductByHandle(params.handle);

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

export default async function ProductPage({ params }: Props) {
  const product = await getProductByHandle(params.handle);

  if (!product) {
    notFound();
  }

  const isB2B = product.tags.includes('B2B') || product.tags.includes('Richiedi Preventivo');
  const isOutOfStock = product.totalInventory <= 0;
  const isLowStock = product.totalInventory > 0 && product.totalInventory < 5;
  const price = parseFloat(product.priceRange.minVariantPrice.amount);
  const currency = product.priceRange.minVariantPrice.currencyCode;
  
  // Get the brand name from vendor
  const brandName = getBrandName(product.vendor);
  const productTitleFormatted = toTitleCase(product.title);
  
  const formattedPrice = new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: currency,
  }).format(price);

  // Generate Product Schema Markup
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
        <div className="flex items-center gap-2 text-amber-600">
          <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-50 text-sm font-medium ring-1 ring-inset ring-amber-500/20">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
            Non disponibile subito
          </span>
          <span className="text-xs text-muted-foreground">Tempo stimato: 5-7 giorni lavorativi</span>
        </div>
      );
    }
    if (isLowStock) {
      return (
        <div className="flex items-center gap-2 text-orange-600">
          <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-orange-50 text-sm font-medium ring-1 ring-inset ring-orange-500/20">
            <span className="w-2 h-2 rounded-full bg-orange-500"></span>
            Ultimi {product.totalInventory} disponibili
          </span>
        </div>
      );
    }
    return (
      <div className="flex items-center gap-2 text-emerald-600">
        <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 text-sm font-medium ring-1 ring-inset ring-emerald-500/20">
          <Check className="w-3.5 h-3.5" />
          Disponibile ({product.totalInventory} pz)
        </span>
        <span className="text-xs text-muted-foreground">Spedizione in 24/48h</span>
      </div>
    );
  };

  return (
    <>
      {/* Product Schema Markup */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(productSchema) }}
      />

      <div className="container px-4 md:px-8 py-6 md:py-10 pb-24 md:pb-10">
        {/* Breadcrumbs */}
        <nav className="flex items-center text-sm text-muted-foreground mb-6 md:mb-8 overflow-x-auto">
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

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
          {/* Gallery */}
          <div className="space-y-4">
            <div className="aspect-square relative overflow-hidden rounded-xl border border-border bg-white p-6 md:p-8">
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
            </div>
            
            {/* Thumbnail gallery placeholder */}
            {product.images?.edges && product.images.edges.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-2">
                {product.images.edges.slice(0, 5).map((img, i) => (
                  <div key={i} className="w-20 h-20 flex-shrink-0 rounded-lg border border-border bg-white p-2 cursor-pointer hover:border-primary transition-colors">
                    <Image
                      src={img.node.url}
                      alt={img.node.altText || `${product.title} - Immagine ${i + 1}`}
                      width={80}
                      height={80}
                      className="w-full h-full object-contain"
                    />
                  </div>
                ))}
              </div>
            )}
            
            {/* Video Gallery - YouTube/HTML5 support */}
            <VideoGallery productTitle={product.title} brand={brandName} />
          </div>

          {/* Product Info */}
          <div className="flex flex-col">
            {/* Brand - Now shows actual brand name instead of legal company name */}
            <div className="mb-2">
              <span className="text-sm font-bold text-primary tracking-wider uppercase">{brandName}</span>
            </div>
            
            {/* Title - Now in Title Case, not all caps */}
            <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold text-foreground mb-4 leading-tight">
              {productTitleFormatted}
            </h1>
            
            {/* SKU and Stock Status */}
            <div className="flex flex-col gap-3 mb-6">
              <div className="flex items-center gap-4 text-sm text-muted-foreground font-mono">
                <span>SKU: {product.variants.edges[0]?.node.sku || 'N/A'}</span>
              </div>
              <StockStatus />
            </div>

            {/* Price and CTA Section */}
            <div className="border-y border-border py-6 my-4 space-y-6">
              {isB2B ? (
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-5">
                  <p className="text-blue-800 font-semibold mb-2">Prodotto riservato ai professionisti</p>
                  <p className="text-sm text-blue-600 mb-4">
                    Il prezzo di questo articolo è visibile solo agli utenti registrati o su richiesta.
                  </p>
                  <button className="w-full inline-flex items-center justify-center rounded-lg bg-blue-600 px-6 py-3.5 text-sm font-bold text-white shadow hover:bg-blue-700 transition-colors">
                    <FileText className="mr-2 h-4 w-4" />
                    RICHIEDI PREVENTIVO
                  </button>
                </div>
              ) : (
                <div className="space-y-5">
                  <div className="flex items-baseline gap-2">
                    <span className="text-4xl font-bold text-foreground">{formattedPrice}</span>
                    <span className="text-sm text-muted-foreground">+ IVA</span>
                  </div>
                  
                  <AddToCartButton 
                    variantId={product.variants.edges[0]?.node.id} 
                    available={!isOutOfStock}
                    productTitle={productTitleFormatted}
                  />
                </div>
              )}
            </div>

            {/* Value Props */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
              <div className="flex items-start gap-3 p-4 rounded-xl bg-muted/30 border border-border/50">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Truck className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h4 className="font-semibold text-sm">Spedizione Rapida</h4>
                  <p className="text-xs text-muted-foreground">Consegna in 24/48h in tutta Italia.</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-4 rounded-xl bg-muted/30 border border-border/50">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Shield className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h4 className="font-semibold text-sm">Garanzia Ufficiale</h4>
                  <p className="text-xs text-muted-foreground">2 anni di garanzia e assistenza diretta.</p>
                </div>
              </div>
            </div>

            {/* Description */}
            {product.descriptionHtml && (
              <div className="prose prose-sm max-w-none text-muted-foreground">
                <h3 className="text-foreground font-bold text-lg mb-3">Descrizione</h3>
                <div 
                  dangerouslySetInnerHTML={{ __html: product.descriptionHtml }} 
                  className="[&>p]:mb-3 [&>ul]:list-disc [&>ul]:pl-5 [&>ul]:mb-3"
                />
              </div>
            )}

            {/* Expert Review - TAYA Style Honest Pro/Contro */}
            <ExpertReview product={product} />

            {/* Related Articles Section */}
            <RelatedArticles 
              productTitle={productTitleFormatted}
              brandName={brandName}
              productTags={product.tags}
            />

            {/* FAQ Section with Schema Markup */}
            <ProductFAQ 
              productTitle={productTitleFormatted}
              brandName={brandName}
            />
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
