import { Metadata } from 'next';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { Check, AlertTriangle, FileText, ShoppingCart, Truck, Shield } from 'lucide-react';
import { getProductByHandle, createCheckout } from '@/lib/shopify';
import { Product } from '@/lib/shopify/types';
import { AddToCartButton } from '@/components/product/add-to-cart';

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
    title: `${product.title} | Autonord Service`,
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
  const price = parseFloat(product.priceRange.minVariantPrice.amount);
  const currency = product.priceRange.minVariantPrice.currencyCode;
  
  const formattedPrice = new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: currency,
  }).format(price);

  return (
    <div className="container px-4 md:px-8 py-8">
      {/* Breadcrumbs */}
      <nav className="flex items-center text-sm text-muted-foreground mb-8">
        <a href="/" className="hover:text-primary">Home</a>
        <span className="mx-2">/</span>
        <a href="/products" className="hover:text-primary">Prodotti</a>
        <span className="mx-2">/</span>
        <span className="text-foreground font-medium truncate max-w-[200px]">{product.title}</span>
      </nav>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
        {/* Gallery */}
        <div className="space-y-4">
          <div className="aspect-square relative overflow-hidden rounded-lg border border-border bg-white p-8">
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
                No Image
              </div>
            )}
          </div>
          {/* Thumbnails would go here */}
        </div>

        {/* Product Info */}
        <div className="flex flex-col">
          <div className="mb-4">
            <h2 className="text-sm font-bold text-primary tracking-wider uppercase mb-1">{product.vendor}</h2>
            <h1 className="text-3xl md:text-4xl font-bold font-heading text-foreground mb-2">{product.title}</h1>
            <div className="flex items-center gap-4 text-sm text-muted-foreground font-mono">
              <span>SKU: {product.variants.edges[0]?.node.sku || 'N/A'}</span>
              {isOutOfStock ? (
                <span className="flex items-center text-amber-600 font-bold">
                  <AlertTriangle className="h-4 w-4 mr-1" /> Su Ordinazione
                </span>
              ) : (
                <span className="flex items-center text-green-600 font-bold">
                  <Check className="h-4 w-4 mr-1" /> Disponibile ({product.totalInventory} pz)
                </span>
              )}
            </div>
          </div>

          <div className="border-y border-border py-6 my-6 space-y-6">
            {isB2B ? (
              <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
                <p className="text-blue-800 font-medium mb-2">Prodotto riservato ai professionisti</p>
                <p className="text-sm text-blue-600 mb-4">
                  Il prezzo di questo articolo è visibile solo agli utenti registrati o su richiesta.
                </p>
                <button className="w-full inline-flex items-center justify-center rounded-md bg-blue-600 px-6 py-3 text-sm font-bold text-white shadow hover:bg-blue-700 transition-colors">
                  <FileText className="mr-2 h-4 w-4" />
                  RICHIEDI PREVENTIVO
                </button>
              </div>
            ) : (
              <div className="space-y-6">
                <div>
                  <span className="text-4xl font-bold text-foreground">{formattedPrice}</span>
                  <span className="text-sm text-muted-foreground ml-2">+ IVA</span>
                </div>
                
                <AddToCartButton 
                  variantId={product.variants.edges[0]?.node.id} 
                  available={!isOutOfStock}
                />
              </div>
            )}
          </div>

          {/* Value Props */}
          <div className="grid grid-cols-2 gap-4 mb-8">
            <div className="flex items-start gap-3 p-4 rounded-lg bg-muted/30">
              <Truck className="h-5 w-5 text-primary mt-0.5" />
              <div>
                <h4 className="font-bold text-sm">Spedizione Rapida</h4>
                <p className="text-xs text-muted-foreground">Consegna in 24/48h in tutta Italia.</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-4 rounded-lg bg-muted/30">
              <Shield className="h-5 w-5 text-primary mt-0.5" />
              <div>
                <h4 className="font-bold text-sm">Garanzia Ufficiale</h4>
                <p className="text-xs text-muted-foreground">2 anni di garanzia e assistenza diretta.</p>
              </div>
            </div>
          </div>

          {/* Description */}
          <div className="prose prose-sm max-w-none text-muted-foreground">
            <h3 className="text-foreground font-bold text-lg mb-2">Descrizione</h3>
            <div dangerouslySetInnerHTML={{ __html: product.descriptionHtml }} />
          </div>
        </div>
      </div>
    </div>
  );
}
