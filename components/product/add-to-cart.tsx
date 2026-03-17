'use client';

import { useState } from 'react';
import { ShoppingCart, Loader2, Check, Truck, ExternalLink } from 'lucide-react';
import { useCart } from '@/lib/cart-context';
import { toast } from 'sonner';

export function AddToCartButton({ variantId, available, productTitle }: {
  variantId: string;
  available: boolean;
  productTitle?: string;
}) {
  const { addItem, loading, cart } = useCart();
  const [justAdded, setJustAdded] = useState(false);

  const handleAddToCart = async () => {
    if (!available) return;

    const ok = await addItem(variantId);

    if (ok) {
      setJustAdded(true);
      setTimeout(() => setJustAdded(false), 2500);
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
          duration: 3500,
          action: {
            label: 'Vai al carrello',
            onClick: () => { window.location.href = '/cart'; },
          },
        }
      );
    } else {
      toast.error('Impossibile aggiungere al carrello. Riprova o contattaci.');
    }
  };

  const handleBuyNow = () => {
    if (!cart?.checkoutUrl) return;
    window.location.href = cart.checkoutUrl;
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Primary CTA: Add to Cart */}
      <button
        onClick={handleAddToCart}
        disabled={!available || loading}
        className="w-full inline-flex items-center justify-center rounded-lg bg-primary px-6 py-4 text-base font-bold text-primary-foreground shadow-lg hover:bg-primary/90 hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
      >
        {loading ? (
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        ) : justAdded ? (
          <Check className="mr-2 h-5 w-5" />
        ) : (
          <ShoppingCart className="mr-2 h-5 w-5" />
        )}
        {!available
          ? 'SU ORDINAZIONE - CONTATTACI'
          : loading
          ? 'AGGIUNTA IN CORSO...'
          : justAdded
          ? 'AGGIUNTO!'
          : 'AGGIUNGI AL CARRELLO'}
      </button>

      {/* Secondary: Go to checkout directly (only when cart exists) */}
      {available && cart && cart.totalQuantity > 0 && (
        <button
          onClick={handleBuyNow}
          className="w-full inline-flex items-center justify-center rounded-lg border-2 border-primary bg-transparent px-6 py-3 text-sm font-semibold text-primary hover:bg-primary/5 transition-all"
        >
          <ExternalLink className="mr-2 h-4 w-4" />
          Acquista ora ({cart.totalQuantity} art. nel carrello)
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

// Sticky Mobile CTA
export function StickyMobileCTA({ variantId, available, price, productTitle }: {
  variantId: string;
  available: boolean;
  price: string;
  productTitle?: string;
}) {
  const { addItem, loading } = useCart();
  const [justAdded, setJustAdded] = useState(false);

  const handleAdd = async () => {
    if (!available) return;
    const ok = await addItem(variantId);
    if (ok) {
      setJustAdded(true);
      setTimeout(() => setJustAdded(false), 2000);
      toast.success(productTitle ? `"${productTitle}" aggiunto al carrello` : 'Aggiunto al carrello!', {
        action: { label: 'Carrello', onClick: () => { window.location.href = '/cart'; } },
      });
    } else {
      toast.error('Impossibile aggiungere al carrello. Riprova.');
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
          onClick={handleAdd}
          disabled={!available || loading}
          className="flex-1 max-w-[200px] inline-flex items-center justify-center rounded-lg bg-primary px-4 py-3 text-sm font-bold text-primary-foreground shadow hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          {loading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : justAdded ? (
            <Check className="mr-2 h-4 w-4" />
          ) : (
            <ShoppingCart className="mr-2 h-4 w-4" />
          )}
          {available ? (justAdded ? 'AGGIUNTO!' : 'AGGIUNGI') : 'CONTATTACI'}
        </button>
      </div>
    </div>
  );
}
