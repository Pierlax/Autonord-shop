'use client';

import Link from 'next/link';
import { ShoppingCart } from 'lucide-react';
import { useCart } from '@/lib/cart-context';

export function CartBadge() {
  const { itemCount } = useCart();

  return (
    <Link
      href="/cart"
      className="relative inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground h-9 py-2 w-9 px-0"
    >
      <ShoppingCart className="h-5 w-5" />
      <span className="sr-only">Carrello</span>
      {itemCount > 0 && (
        <span className="absolute -top-1 -right-1 h-4 w-4 min-w-4 px-0.5 rounded-full bg-primary text-[10px] font-bold text-primary-foreground flex items-center justify-center">
          {itemCount > 99 ? '99+' : itemCount}
        </span>
      )}
    </Link>
  );
}
