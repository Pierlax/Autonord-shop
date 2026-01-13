'use client';

import Link from 'next/link';
import Image from 'next/image';
import { ShoppingCart, FileText } from 'lucide-react';
import { Product } from '@/lib/shopify/types';
import { toast } from 'sonner';

export function ProductCard({ product }: { product: Product }) {
  const isB2B = product.tags.includes('B2B') || product.tags.includes('Richiedi Preventivo');
  const isOutOfStock = product.totalInventory <= 0;
  
  const price = parseFloat(product.priceRange.minVariantPrice.amount);
  const currency = product.priceRange.minVariantPrice.currencyCode;
  
  const formattedPrice = new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: currency,
  }).format(price);

  const handleAddToCart = (e: React.MouseEvent) => {
    e.preventDefault();
    // Logic to add to cart context would go here
    toast.success(`${product.title} aggiunto al carrello`);
  };

  return (
    <Link href={`/products/${product.handle}`} className="group relative flex flex-col overflow-hidden rounded-lg border border-border bg-card transition-all hover:shadow-lg">
      {/* Image Container */}
      <div className="aspect-square overflow-hidden bg-white p-4 relative">
        {product.featuredImage ? (
          <Image
            src={product.featuredImage.url}
            alt={product.featuredImage.altText || product.title}
            width={500}
            height={500}
            className="h-full w-full object-contain transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="h-full w-full flex items-center justify-center bg-muted text-muted-foreground">
            No Image
          </div>
        )}
        
        {/* Badges */}
        <div className="absolute top-2 left-2 flex flex-col gap-1">
          {isOutOfStock && (
            <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-800">
              Su Ordinazione
            </span>
          )}
          {isB2B && (
            <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-800">
              Professional
            </span>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col p-4">
        <div className="mb-2 text-xs text-muted-foreground font-mono">
          {product.vendor}
        </div>
        <h3 className="mb-2 text-sm font-bold leading-tight text-foreground line-clamp-2 min-h-[2.5rem]">
          {product.title}
        </h3>
        
        <div className="mt-auto flex items-center justify-between pt-4">
          <div className="flex flex-col">
            {isB2B ? (
              <span className="text-sm font-medium text-muted-foreground">Prezzo Riservato</span>
            ) : (
              <span className="text-lg font-bold text-primary">{formattedPrice}</span>
            )}
            <span className="text-[10px] text-muted-foreground">IVA esclusa</span>
          </div>
          
          {isB2B ? (
            <button 
              className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-secondary text-secondary-foreground hover:bg-secondary/80"
              title="Richiedi Preventivo"
            >
              <FileText className="h-4 w-4" />
            </button>
          ) : (
            <button 
              onClick={handleAddToCart}
              disabled={isOutOfStock}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
              title="Aggiungi al Carrello"
            >
              <ShoppingCart className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </Link>
  );
}
