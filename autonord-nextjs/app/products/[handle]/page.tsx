import { Metadata } from 'next';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { Check, AlertTriangle, FileText, ShoppingCart, Truck, Shield, Wrench, MessageCircle, MapPin } from 'lucide-react';
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
                
                {/* WhatsApp Support Button */}
                <a 
                  href={`https://wa.me/390107456076?text=Salve, vorrei informazioni su: ${product.title} (SKU: ${product.variants.edges[0]?.node.sku})`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full inline-flex items-center justify-center rounded-md border border-emerald-500 bg-emerald-50 px-6 py-3 text-sm font-bold text-emerald-700 hover:bg-emerald-100 transition-colors"
                >
                  <MessageCircle className="mr-2 h-4 w-4" />
                  DUBBI? CHIEDI AL TECNICO SU WHATSAPP
                </a>
              </div>
            )}
          </div>

          {/* Value Props - Perché Autonord */}
          <div className="bg-slate-50 rounded-lg p-5 mb-8 border border-slate-200">
            <h4 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" /> PERCHÉ ACQUISTARE DA AUTONORD?
            </h4>
            <div className="grid grid-cols-1 gap-3">
              <div className="flex items-start gap-3">
                <Wrench className="h-5 w-5 text-slate-500 mt-0.5 shrink-0" />
                <div>
                  <p className="font-semibold text-sm text-slate-900">Centro Assistenza Ufficiale</p>
                  <p className="text-xs text-slate-600">Non siamo solo venditori. Se si rompe, lo ripariamo noi nella nostra officina di Genova.</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Truck className="h-5 w-5 text-slate-500 mt-0.5 shrink-0" />
                <div>
                  <p className="font-semibold text-sm text-slate-900">Spedizione Rapida o Ritiro in Sede</p>
                  <p className="text-xs text-slate-600">Consegna in 24/48h in tutta Italia. Sei di Genova? Ritira subito in negozio.</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <MapPin className="h-5 w-5 text-slate-500 mt-0.5 shrink-0" />
                <div>
                  <p className="font-semibold text-sm text-slate-900">Sede Fisica Reale</p>
                  <p className="text-xs text-slate-600">Siamo in Via Sardorella 45, Genova Bolzaneto. Passa a trovarci dal 1980.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Description */}
          <div className="prose prose-sm max-w-none text-muted-foreground">
            <h3 className="text-foreground font-bold text-lg mb-2">Descrizione Tecnica</h3>
            <div dangerouslySetInnerHTML={{ __html: product.descriptionHtml }} />
          </div>
        </div>
      </div>
    </div>
  );
}
