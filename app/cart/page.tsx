'use client';

import { useCart } from '@/lib/cart-context';
import { Loader2, Trash2, ShoppingCart, ArrowRight, Minus, Plus } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';

export default function CartPage() {
  const { items, itemCount, subtotal, checkoutLoading, updateQty, removeItem, checkout } = useCart();

  if (itemCount === 0) {
    return (
      <div className="container max-w-2xl mx-auto px-4 py-24 text-center">
        <ShoppingCart className="w-16 h-16 text-muted-foreground mx-auto mb-6" />
        <h1 className="text-2xl font-bold mb-2">Il tuo carrello è vuoto</h1>
        <p className="text-muted-foreground mb-8">
          Aggiungi prodotti dal catalogo per iniziare.
        </p>
        <Link
          href="/products"
          className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-lg font-semibold hover:bg-primary/90 transition-colors"
        >
          Scopri i prodotti
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    );
  }

  return (
    <div className="container max-w-5xl mx-auto px-4 py-12">
      <h1 className="text-3xl font-bold mb-8">
        Carrello
        <span className="ml-3 text-lg font-normal text-muted-foreground">
          ({itemCount} {itemCount === 1 ? 'articolo' : 'articoli'})
        </span>
      </h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Line items */}
        <div className="lg:col-span-2 space-y-4">
          {items.map(item => {
            const unitPrice = parseFloat(item.price);
            const lineTotal = (unitPrice * item.quantity).toFixed(2);

            return (
              <div key={item.variantId} className="flex gap-4 p-4 border border-border rounded-xl bg-card">
                {/* Image */}
                <div className="relative w-24 h-24 flex-shrink-0 rounded-lg overflow-hidden bg-muted">
                  {item.imageUrl ? (
                    <Image
                      src={item.imageUrl}
                      alt={item.title}
                      fill
                      sizes="96px"
                      className="object-contain"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                      <ShoppingCart className="w-8 h-8" />
                    </div>
                  )}
                </div>

                {/* Details */}
                <div className="flex-1 min-w-0">
                  <Link
                    href={item.handle ? `/products/${item.handle}` : '#'}
                    className="font-semibold text-sm hover:text-primary transition-colors line-clamp-2"
                  >
                    {item.title}
                  </Link>
                  {item.variantTitle && item.variantTitle !== 'Default Title' && (
                    <p className="text-xs text-muted-foreground mt-0.5">{item.variantTitle}</p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    {unitPrice.toFixed(2)} {item.currencyCode} / cad.
                  </p>

                  {/* Qty controls */}
                  <div className="flex items-center gap-3 mt-3">
                    <div className="flex items-center border border-border rounded-lg overflow-hidden">
                      <button
                        onClick={() => updateQty(item.variantId, item.quantity - 1)}
                        className="p-2 hover:bg-muted transition-colors"
                        aria-label="Diminuisci quantità"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="w-8 text-center text-sm font-medium">{item.quantity}</span>
                      <button
                        onClick={() => updateQty(item.variantId, item.quantity + 1)}
                        className="p-2 hover:bg-muted transition-colors"
                        aria-label="Aumenta quantità"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                    <button
                      onClick={() => removeItem(item.variantId)}
                      className="p-2 text-muted-foreground hover:text-destructive transition-colors"
                      aria-label="Rimuovi dal carrello"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Line total */}
                <div className="text-right flex-shrink-0">
                  <p className="font-bold">{lineTotal} {item.currencyCode}</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Order summary */}
        <div className="lg:col-span-1">
          <div className="sticky top-24 border border-border rounded-xl bg-card p-6 space-y-4">
            <h2 className="text-lg font-bold">Riepilogo ordine</h2>

            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Subtotale</span>
              <span>{subtotal.toFixed(2)} {items[0]?.currencyCode ?? 'EUR'}</span>
            </div>
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Spedizione</span>
              <span>Calcolata al checkout</span>
            </div>
            <div className="border-t border-border pt-4 flex justify-between font-bold text-lg">
              <span>Totale</span>
              <span>{subtotal.toFixed(2)} {items[0]?.currencyCode ?? 'EUR'}</span>
            </div>
            <p className="text-xs text-muted-foreground">Prezzi IVA esclusa. IVA calcolata al checkout.</p>

            <button
              onClick={checkout}
              disabled={checkoutLoading}
              className="w-full inline-flex items-center justify-center gap-2 px-6 py-4 bg-primary text-primary-foreground rounded-lg font-bold hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {checkoutLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  Procedi al checkout
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>

            <Link
              href="/products"
              className="block text-center text-sm text-muted-foreground hover:text-primary transition-colors"
            >
              ← Continua gli acquisti
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
