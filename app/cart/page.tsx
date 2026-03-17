'use client';

import { useCart } from '@/lib/cart-context';
import { Loader2, Trash2, ShoppingCart, ArrowRight, Minus, Plus } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';

export default function CartPage() {
  const { cart, itemCount, loading, updateItem, removeItem } = useCart();

  const lines = cart?.lines?.edges?.map(e => e.node) ?? [];
  const total = cart?.cost?.totalAmount;
  const checkoutUrl = cart?.checkoutUrl;

  if (itemCount === 0 && !loading) {
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
        {itemCount > 0 && (
          <span className="ml-3 text-lg font-normal text-muted-foreground">
            ({itemCount} {itemCount === 1 ? 'articolo' : 'articoli'})
          </span>
        )}
      </h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Line items */}
        <div className="lg:col-span-2 space-y-4">
          {lines.map(line => {
            const img = line.merchandise.product.featuredImage;
            const unitPrice = parseFloat(line.merchandise.price.amount);
            const currency = line.merchandise.price.currencyCode;
            const lineTotal = (unitPrice * line.quantity).toFixed(2);

            return (
              <div
                key={line.id}
                className="flex gap-4 p-4 border border-border rounded-xl bg-card"
              >
                {/* Image */}
                <div className="relative w-24 h-24 flex-shrink-0 rounded-lg overflow-hidden bg-muted">
                  {img ? (
                    <Image
                      src={img.url}
                      alt={img.altText ?? line.merchandise.product.title}
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
                    href={`/products/${line.merchandise.product.handle}`}
                    className="font-semibold text-sm hover:text-primary transition-colors line-clamp-2"
                  >
                    {line.merchandise.product.title}
                  </Link>
                  {line.merchandise.title !== 'Default Title' && (
                    <p className="text-xs text-muted-foreground mt-0.5">{line.merchandise.title}</p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    {unitPrice.toFixed(2)} {currency} / cad.
                  </p>

                  {/* Qty controls */}
                  <div className="flex items-center gap-3 mt-3">
                    <div className="flex items-center border border-border rounded-lg overflow-hidden">
                      <button
                        onClick={() => line.quantity > 1 ? updateItem(line.id, line.quantity - 1) : removeItem(line.id)}
                        disabled={loading}
                        className="p-2 hover:bg-muted transition-colors disabled:opacity-50"
                        aria-label="Diminuisci quantità"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="w-8 text-center text-sm font-medium">{line.quantity}</span>
                      <button
                        onClick={() => updateItem(line.id, line.quantity + 1)}
                        disabled={loading}
                        className="p-2 hover:bg-muted transition-colors disabled:opacity-50"
                        aria-label="Aumenta quantità"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>

                    <button
                      onClick={() => removeItem(line.id)}
                      disabled={loading}
                      className="p-2 text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
                      aria-label="Rimuovi dal carrello"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Line total */}
                <div className="text-right flex-shrink-0">
                  <p className="font-bold">{lineTotal} {currency}</p>
                </div>
              </div>
            );
          })}

          {loading && (
            <div className="flex items-center justify-center py-4 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              <span className="text-sm">Aggiornamento carrello...</span>
            </div>
          )}
        </div>

        {/* Order summary */}
        <div className="lg:col-span-1">
          <div className="sticky top-24 border border-border rounded-xl bg-card p-6 space-y-4">
            <h2 className="text-lg font-bold">Riepilogo ordine</h2>

            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Subtotale</span>
              <span>
                {cart?.cost?.subtotalAmount?.amount
                  ? `${parseFloat(cart.cost.subtotalAmount.amount).toFixed(2)} ${cart.cost.subtotalAmount.currencyCode}`
                  : '—'}
              </span>
            </div>

            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Spedizione</span>
              <span>Calcolata al checkout</span>
            </div>

            <div className="border-t border-border pt-4 flex justify-between font-bold text-lg">
              <span>Totale</span>
              <span>
                {total
                  ? `${parseFloat(total.amount).toFixed(2)} ${total.currencyCode}`
                  : '—'}
              </span>
            </div>

            <p className="text-xs text-muted-foreground">Prezzi IVA esclusa. IVA calcolata al checkout.</p>

            {checkoutUrl ? (
              <a
                href={checkoutUrl}
                className="w-full inline-flex items-center justify-center gap-2 px-6 py-4 bg-primary text-primary-foreground rounded-lg font-bold hover:bg-primary/90 transition-colors"
              >
                Procedi al checkout
                <ArrowRight className="w-5 h-5" />
              </a>
            ) : (
              <button disabled className="w-full px-6 py-4 bg-primary/50 text-primary-foreground rounded-lg font-bold cursor-not-allowed">
                Procedi al checkout
              </button>
            )}

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
