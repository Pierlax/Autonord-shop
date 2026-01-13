'use client';

import { useState } from 'react';
import { ShoppingCart, Loader2, Check, Truck } from 'lucide-react';
import { createCheckout } from '@/lib/shopify';
import { toast } from 'sonner';

export function AddToCartButton({ variantId, available, productTitle }: { variantId: string, available: boolean, productTitle?: string }) {
  const [isLoading, setIsLoading] = useState(false);
  const [justAdded, setJustAdded] = useState(false);

  const handleBuyNow = async () => {
    if (!available) return;
    
    setIsLoading(true);
    try {
      const checkoutUrl = await createCheckout(variantId, 1);
      if (checkoutUrl) {
        // Show success feedback before redirect
        toast.success(
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0 w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
              <Check className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="font-semibold">Reindirizzamento al checkout...</p>
              <p className="text-xs text-gray-500">Pagamento sicuro Shopify</p>
            </div>
          </div>,
          { duration: 2000 }
        );
        
        // Small delay for UX
        setTimeout(() => {
          window.location.href = checkoutUrl;
        }, 500);
      } else {
        toast.error("Errore durante la creazione del checkout. Riprova.");
      }
    } catch (error) {
      toast.error("Si è verificato un errore imprevisto. Riprova più tardi.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddToCart = () => {
    if (!available) return;
    
    setJustAdded(true);
    toast.success(
      <div className="flex items-center gap-3">
        <div className="flex-shrink-0 w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
          <Check className="w-5 h-5 text-green-600" />
        </div>
        <div>
          <p className="font-semibold">Aggiunto al carrello!</p>
          {productTitle && <p className="text-xs text-gray-500 line-clamp-1">{productTitle}</p>}
        </div>
      </div>,
      {
        duration: 3000,
        action: {
          label: 'Checkout',
          onClick: handleBuyNow,
        },
      }
    );
    
    setTimeout(() => setJustAdded(false), 2000);
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Main CTA Button */}
      <button
        onClick={handleBuyNow}
        disabled={!available || isLoading}
        className="w-full inline-flex items-center justify-center rounded-lg bg-primary px-6 py-4 text-base font-bold text-primary-foreground shadow-lg hover:bg-primary/90 hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
      >
        {isLoading ? (
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        ) : justAdded ? (
          <Check className="mr-2 h-5 w-5" />
        ) : (
          <ShoppingCart className="mr-2 h-5 w-5" />
        )}
        {!available ? 'SU ORDINAZIONE - CONTATTACI' : isLoading ? 'ELABORAZIONE...' : justAdded ? 'AGGIUNTO!' : 'ACQUISTA ORA'}
      </button>
      
      {/* Secondary Add to Cart (for users who want to continue shopping) */}
      {available && (
        <button
          onClick={handleAddToCart}
          disabled={isLoading}
          className="w-full inline-flex items-center justify-center rounded-lg border-2 border-primary bg-transparent px-6 py-3 text-sm font-semibold text-primary hover:bg-primary/5 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          <ShoppingCart className="mr-2 h-4 w-4" />
          Aggiungi al Carrello
        </button>
      )}
      
      {/* Trust indicators */}
      <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
        <Truck className="h-3.5 w-3.5" />
        <span>Spedizione rapida • Pagamento sicuro Shopify</span>
      </div>
    </div>
  );
}

// Sticky Mobile CTA Component
export function StickyMobileCTA({ variantId, available, price, productTitle }: { 
  variantId: string, 
  available: boolean, 
  price: string,
  productTitle?: string 
}) {
  const [isLoading, setIsLoading] = useState(false);

  const handleBuyNow = async () => {
    if (!available) return;
    
    setIsLoading(true);
    try {
      const checkoutUrl = await createCheckout(variantId, 1);
      if (checkoutUrl) {
        toast.success('Reindirizzamento al checkout...');
        setTimeout(() => {
          window.location.href = checkoutUrl;
        }, 300);
      } else {
        toast.error("Errore durante la creazione del checkout");
      }
    } catch (error) {
      toast.error("Si è verificato un errore imprevisto");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-sm border-t border-border p-4 md:hidden shadow-[0_-4px_20px_rgba(0,0,0,0.1)]">
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col">
          <span className="text-lg font-bold">{price}</span>
          <span className="text-xs text-muted-foreground">+ IVA</span>
        </div>
        <button
          onClick={handleBuyNow}
          disabled={!available || isLoading}
          className="flex-1 max-w-[200px] inline-flex items-center justify-center rounded-lg bg-primary px-4 py-3 text-sm font-bold text-primary-foreground shadow hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          {isLoading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <ShoppingCart className="mr-2 h-4 w-4" />
          )}
          {available ? 'ACQUISTA' : 'CONTATTACI'}
        </button>
      </div>
    </div>
  );
}
