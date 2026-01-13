'use client';

import Link from 'next/link';
import Image from 'next/image';
import { ShoppingCart, FileText, Check, Sparkles } from 'lucide-react';
import { Product } from '@/lib/shopify/types';
import { toast } from 'sonner';
import { toTitleCase } from '@/lib/utils';

export function ProductCard({ product }: { product: Product }) {
  const isB2B = product.tags.includes('B2B') || product.tags.includes('Richiedi Preventivo');
  const isOutOfStock = product.totalInventory <= 0;
  const isLowStock = product.totalInventory > 0 && product.totalInventory < 5;
  const isNew = product.tags.includes('new') || product.tags.includes('nuovo') || product.tags.includes('novità');
  
  const price = parseFloat(product.priceRange.minVariantPrice.amount);
  
  // Get compare at price from first variant if available
  const firstVariant = product.variants?.edges?.[0]?.node;
  const compareAtPrice = firstVariant?.compareAtPrice?.amount 
    ? parseFloat(firstVariant.compareAtPrice.amount) 
    : null;
  const currency = product.priceRange.minVariantPrice.currencyCode;
  
  // Calculate discount percentage if compare at price exists
  const discountPercentage = compareAtPrice && compareAtPrice > price 
    ? Math.round(((compareAtPrice - price) / compareAtPrice) * 100) 
    : null;
  
  const formattedPrice = new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: currency,
  }).format(price);

  const formattedCompareAtPrice = compareAtPrice ? new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: currency,
  }).format(compareAtPrice) : null;

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
    <Link 
      href={`/products/${product.handle}`} 
      className="group relative flex flex-col overflow-hidden rounded-xl border border-border bg-card transition-all duration-300 hover:shadow-xl hover:shadow-primary/5 hover:border-primary/40 hover:-translate-y-1"
    >
      {/* Image Container */}
      <div className="aspect-square overflow-hidden bg-white p-4 relative">
        {product.featuredImage ? (
          <Image
            src={product.featuredImage.url}
            alt={product.featuredImage.altText || product.title}
            width={500}
            height={500}
            className="h-full w-full object-contain transition-transform duration-500 group-hover:scale-110"
          />
        ) : (
          <div className="h-full w-full flex items-center justify-center bg-muted text-muted-foreground">
            No Image
          </div>
        )}
        
        {/* Top Left Badges - Stock & New */}
        <div className="absolute top-2 left-2 flex flex-col gap-1.5">
          <StockBadge />
          {isNew && (
            <span className="inline-flex items-center rounded-full bg-purple-500 px-2.5 py-1 text-xs font-bold text-white shadow-sm">
              <Sparkles className="w-3 h-3 mr-1" />
              Novità
            </span>
          )}
          {isB2B && (
            <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-600/20">
              Professional
            </span>
          )}
        </div>

        {/* Top Right Badge - Discount */}
        {discountPercentage && discountPercentage > 0 && (
          <div className="absolute top-2 right-2">
            <span className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-red-500 text-white font-bold text-sm shadow-lg">
              -{discountPercentage}%
            </span>
          </div>
        )}

        {/* Quick Add Button - Appears on Hover */}
        <div className="absolute bottom-4 left-4 right-4 opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300">
          {!isB2B && (
            <button 
              onClick={handleAddToCart}
              disabled={isOutOfStock}
              className="w-full h-10 flex items-center justify-center gap-2 rounded-lg bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-lg"
            >
              <ShoppingCart className="h-4 w-4" />
              {isOutOfStock ? 'Su Ordinazione' : 'Aggiungi al Carrello'}
            </button>
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
        <h3 className="mb-3 text-sm font-medium leading-snug text-foreground line-clamp-2 min-h-[2.5rem] group-hover:text-primary transition-colors">
          {toTitleCase(product.title)}
        </h3>
        
        <div className="mt-auto flex items-center justify-between pt-3 border-t border-border/50">
          <div className="flex flex-col">
            {isB2B ? (
              <span className="text-sm font-medium text-muted-foreground">Prezzo Riservato</span>
            ) : (
              <div className="flex items-baseline gap-2">
                <span className="text-lg font-bold text-foreground">{formattedPrice}</span>
                {formattedCompareAtPrice && discountPercentage && (
                  <span className="text-sm text-muted-foreground line-through">{formattedCompareAtPrice}</span>
                )}
              </div>
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
              className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95 md:hidden"
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
