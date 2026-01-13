'use client';

import { useState } from 'react';
import { ShoppingCart, Loader2 } from 'lucide-react';
import { createCheckout } from '@/lib/shopify';
import { toast } from 'sonner';

export function AddToCartButton({ variantId, available }: { variantId: string, available: boolean }) {
  const [isLoading, setIsLoading] = useState(false);

  const handleBuyNow = async () => {
    if (!available) return;
    
    setIsLoading(true);
    try {
      const checkoutUrl = await createCheckout(variantId, 1);
      if (checkoutUrl) {
        window.location.href = checkoutUrl;
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
    <div className="flex flex-col gap-3">
      <button
        onClick={handleBuyNow}
        disabled={!available || isLoading}
        className="w-full inline-flex items-center justify-center rounded-md bg-primary px-6 py-4 text-base font-bold text-primary-foreground shadow hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
      >
        {isLoading ? (
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        ) : (
          <ShoppingCart className="mr-2 h-5 w-5" />
        )}
        {available ? 'ACQUISTA ORA' : 'NON DISPONIBILE'}
      </button>
      <p className="text-xs text-center text-muted-foreground">
        Pagamento sicuro gestito da Shopify. Spedizione calcolata al checkout.
      </p>
    </div>
  );
}
