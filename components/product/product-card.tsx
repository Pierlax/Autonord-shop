'use client';

import Link from 'next/link';
import Image from 'next/image';
import { ShoppingCart, FileText, Check } from 'lucide-react';
import { Product } from '@/lib/shopify/types';
import { toast } from 'sonner';
import { toTitleCase } from '@/lib/utils';

export function ProductCard({ product }: { product: Product }) {
  const isB2B = product.tags.includes('B2B') || product.tags.includes('Richiedi Preventivo');
  const isOutOfStock = product.totalInventory <= 0;
  const isLowStock = product.totalInventory > 0 && product.totalInventory < 5;
  
  const price = parseFloat(product.priceRange.minVariantPrice.amount);
  const currency = product.priceRange.minVariantPrice.currencyCode;
  
  const formattedPrice = new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: currency,
  }).format(price);

  const handleAddToCart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Enhanced toast with icon and action
    toast.success(
      <div className="flex items-center gap-3">
        <div className="flex-shrink-0 w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
          <Check className="w-5 h-5 text-green-600" />
        </div>
        <div className="flex-1">
          <p className="font-semibold text-sm">Aggiunto al carrello!</p>
          <p className="text-xs text-gray-500 line-clamp-1">{toTitleCase(product.title)}</p>
        </div>
      </div>,
      {
        duration: 3000,
        action: {
          label: 'Vai al carrello',
          onClick: () => window.location.href = '/cart',
        },
      }
    );
  };

  // Stock badge component
  const StockBadge = () => {
    if (isOutOfStock) {
      return (
        <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-600/20">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mr-1.5 animate-pulse"></span>
          Su Ordinazione
        </span>
      );
    }
    if (isLowStock) {
      return (
        <span className="inline-flex items-center rounded-full bg-orange-50 px-2.5 py-1 text-xs font-medium text-orange-700 ring-1 ring-inset ring-orange-600/20">
          <span className="w-1.5 h-1.5 rounded-full bg-orange-500 mr-1.5"></span>
          Ultimi {product.totalInventory} pz
        </span>
      );
    }
    return (
      <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5"></span>
        Disponibile
      </span>
    );
  };

  return (
    <Link href={`/products/${product.handle}`} className="group relative flex flex-col overflow-hidden rounded-lg border border-border bg-card transition-all hover:shadow-lg hover:border-primary/30">
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
        <div className="absolute top-2 left-2 flex flex-col gap-1.5">
          <StockBadge />
          {isB2B && (
            <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-600/20">
              Professional
            </span>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col p-4">
        {/* Vendor/Brand */}
        <div className="mb-1.5 text-xs text-primary font-semibold tracking-wide uppercase">
          {product.vendor}
        </div>
        
        {/* Product Title - Now in Title Case */}
        <h3 className="mb-3 text-sm font-medium leading-snug text-foreground line-clamp-2 min-h-[2.5rem]">
          {toTitleCase(product.title)}
        </h3>
        
        <div className="mt-auto flex items-center justify-between pt-3 border-t border-border/50">
          <div className="flex flex-col">
            {isB2B ? (
              <span className="text-sm font-medium text-muted-foreground">Prezzo Riservato</span>
            ) : (
              <span className="text-lg font-bold text-foreground">{formattedPrice}</span>
            )}
            <span className="text-[10px] text-muted-foreground">IVA esclusa</span>
          </div>
          
          {isB2B ? (
            <button 
              onClick={(e) => {
                e.preventDefault();
                toast.info('Richiedi un preventivo personalizzato contattandoci.');
              }}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-blue-100 text-blue-700 hover:bg-blue-200 transition-colors"
              title="Richiedi Preventivo"
            >
              <FileText className="h-4 w-4" />
            </button>
          ) : (
            <button 
              onClick={handleAddToCart}
              disabled={isOutOfStock}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95"
              title={isOutOfStock ? "Su Ordinazione" : "Aggiungi al Carrello"}
            >
              <ShoppingCart className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </Link>
  );
}
