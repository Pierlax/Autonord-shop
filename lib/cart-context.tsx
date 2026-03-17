'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import {
  Cart,
  cartCreate,
  cartLinesAdd,
  cartLinesUpdate,
  cartLinesRemove,
  getCart,
} from '@/lib/shopify/cart';

// =============================================================================
// CONTEXT TYPE
// =============================================================================

interface CartContextValue {
  cart: Cart | null;
  itemCount: number;
  loading: boolean;
  addItem: (variantId: string, quantity?: number) => Promise<boolean>;
  updateItem: (lineId: string, quantity: number) => Promise<void>;
  removeItem: (lineId: string) => Promise<void>;
}

const CartContext = createContext<CartContextValue | null>(null);

const CART_ID_KEY = 'shopify_cart_id';

// =============================================================================
// PROVIDER
// =============================================================================

export function CartProvider({ children }: { children: ReactNode }) {
  const [cart, setCart] = useState<Cart | null>(null);
  const [loading, setLoading] = useState(false);

  // Restore cart from localStorage on mount
  useEffect(() => {
    const savedCartId = typeof window !== 'undefined' ? localStorage.getItem(CART_ID_KEY) : null;
    if (!savedCartId) return;

    getCart(savedCartId).then(existing => {
      if (existing) {
        setCart(existing);
      } else {
        // Cart expired or invalid — clear it
        localStorage.removeItem(CART_ID_KEY);
      }
    });
  }, []);

  const persistCart = (newCart: Cart) => {
    setCart(newCart);
    localStorage.setItem(CART_ID_KEY, newCart.id);
  };

  const addItem = useCallback(async (variantId: string, quantity = 1): Promise<boolean> => {
    setLoading(true);
    try {
      let updated: Cart | null;
      if (cart) {
        updated = await cartLinesAdd(cart.id, variantId, quantity);
      } else {
        updated = await cartCreate(variantId, quantity);
      }
      if (updated) {
        persistCart(updated);
        return true;
      }
      console.error('[Cart] addItem: API returned null — check storefront token and variant ID');
      return false;
    } finally {
      setLoading(false);
    }
  }, [cart]);

  const updateItem = useCallback(async (lineId: string, quantity: number) => {
    if (!cart) return;
    setLoading(true);
    try {
      const updated = await cartLinesUpdate(cart.id, lineId, quantity);
      if (updated) persistCart(updated);
    } finally {
      setLoading(false);
    }
  }, [cart]);

  const removeItem = useCallback(async (lineId: string) => {
    if (!cart) return;
    setLoading(true);
    try {
      const updated = await cartLinesRemove(cart.id, lineId);
      if (updated) persistCart(updated);
    } finally {
      setLoading(false);
    }
  }, [cart]);

  const itemCount = cart?.totalQuantity ?? 0;

  return (
    <CartContext.Provider value={{ cart, itemCount, loading, addItem, updateItem, removeItem }}>
      {children}
    </CartContext.Provider>
  );
}

// =============================================================================
// HOOK
// =============================================================================

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside <CartProvider>');
  return ctx;
}
