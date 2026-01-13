import { getProductByHandle } from "@/lib/shopify";
import { notFound } from "next/navigation";
import { ProductCard } from "@/components/product/product-card";
import { AddToCart } from "@/components/product/add-to-cart";
import { Metadata } from "next";

interface ProductPageProps {
  params: {
    handle: string;
  };
}

// Generazione dinamica dei metadata SEO
export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const product = await getProductByHandle(params.handle);

  if (!product) {
    return {
      title: "Prodotto non trovato",
      description: "Il prodotto che stai cercando non è disponibile."
    };
  }

  const { url, altText } = product.featuredImage || {};
  const price = product.priceRange.minVariantPrice.amount;
  const currency = product.priceRange.minVariantPrice.currencyCode;

  return {
    title: product.seo?.title || product.title,
    description: product.seo?.description || product.description.substring(0, 160),
    openGraph: {
      title: product.title,
      description: product.description.substring(0, 160),
      images: url ? [{ url, alt: altText || product.title }] : [],
      type: "article",
      price: {
        amount: price,
        currency: currency
      }
    }
  };
}

export default async function ProductPage({ params }: ProductPageProps) {
  const product = await getProductByHandle(params.handle);

  if (!product) {
    notFound();
  }

  return (
    <div className="container mx-auto px-4 py-12">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
        {/* Galleria Immagini */}
        <div className="space-y-4">
          <div className="aspect-square relative overflow-hidden rounded-lg border bg-white">
            {product.featuredImage && (
              <img
                src={product.featuredImage.url}
                alt={product.featuredImage.altText || product.title}
                className="object-contain w-full h-full p-4"
              />
            )}
          </div>
          <div className="grid grid-cols-4 gap-4">
            {product.images.edges.map(({ node: image }) => (
              <div key={image.url} className="aspect-square relative overflow-hidden rounded-md border bg-white cursor-pointer hover:border-primary">
                <img
                  src={image.url}
                  alt={image.altText || product.title}
                  className="object-contain w-full h-full p-2"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Dettagli Prodotto */}
        <div className="space-y-8">
          <div>
            <h1 className="text-4xl font-heading font-bold text-slate-900 mb-2">{product.title}</h1>
            <div className="flex items-center gap-4 text-sm text-slate-500">
              {product.vendor && <span className="font-medium text-primary">{product.vendor}</span>}
              {product.variants.edges[0]?.node.sku && (
                <span>SKU: {product.variants.edges[0].node.sku}</span>
              )}
            </div>
          </div>

          <div className="border-t border-b py-6 space-y-4">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-slate-900">
                {parseFloat(product.priceRange.minVariantPrice.amount).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}
              </span>
              <span className="text-sm text-slate-500">+ IVA</span>
            </div>
            
            <div className="flex items-center gap-2 text-sm">
              <div className={`w-3 h-3 rounded-full ${product.availableForSale ? 'bg-green-500' : 'bg-red-500'}`} />
              <span className="font-medium">
                {product.availableForSale ? 'Disponibile a magazzino' : 'Attualmente non disponibile'}
              </span>
            </div>
          </div>

          <div className="prose prose-slate max-w-none" dangerouslySetInnerHTML={{ __html: product.descriptionHtml }} />

          <div className="pt-6">
            <AddToCart 
              variantId={product.variants.edges[0]?.node.id} 
              available={product.availableForSale} 
            />
          </div>
        </div>
      </div>
    </div>
  );
}
