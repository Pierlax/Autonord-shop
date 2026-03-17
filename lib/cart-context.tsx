'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { createCheckoutMulti } from '@/lib/shopify';

// =============================================================================
// TYPES
// =============================================================================

export interface CartItem {
  variantId: string;
  quantity: number;
  title: string;
  variantTitle: string;
  price: string;         // e.g. "149.00"
  currencyCode: string;  // e.g. "EUR"
  imageUrl: string | null;
  handle: string;
}

interface CartContextValue {
  items: CartItem[];
  itemCount: number;
  subtotal: number;
  checkoutLoading: boolean;
  addItem: (item: Omit<CartItem, 'quantity'>, quantity?: number) => boolean;
  updateQty: (variantId: string, quantity: number) => void;
  removeItem: (variantId: string) => void;
  checkout: () => Promise<void>;
}

const CartContext = createContext<CartContextValue | null>(null);
const STORAGE_KEY = 'autonord_cart';

// =============================================================================
// PROVIDER
// =============================================================================

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [checkoutLoading, setCheckoutLoading] = useState(false);

  // Hydrate from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setItems(JSON.parse(raw));
    } catch { /* ignore */ }
  }, []);

  // Persist on every change
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items]);

  const addItem = useCallback((itemData: Omit<CartItem, 'quantity'>, quantity = 1): boolean => {
    setItems(prev => {
      const existing = prev.find(i => i.variantId === itemData.variantId);
      if (existing) {
        return prev.map(i =>
          i.variantId === itemData.variantId
            ? { ...i, quantity: i.quantity + quantity }
            : i
        );
      }
      return [...prev, { ...itemData, quantity }];
    });
    return true;
  }, []);

  const updateQty = useCallback((variantId: string, quantity: number) => {
    if (quantity <= 0) {
      setItems(prev => prev.filter(i => i.variantId !== variantId));
    } else {
      setItems(prev => prev.map(i => i.variantId === variantId ? { ...i, quantity } : i));
    }
  }, []);

  const removeItem = useCallback((variantId: string) => {
    setItems(prev => prev.filter(i => i.variantId !== variantId));
  }, []);

  const checkout = useCallback(async () => {
    if (items.length === 0) return;
    setCheckoutLoading(true);
    try {
      const lineItems = items.map(i => ({ variantId: i.variantId, quantity: i.quantity }));
      const url = await createCheckoutMulti(lineItems);
      if (url) {
        window.location.href = url;
      }
    } finally {
      setCheckoutLoading(false);
    }
  }, [items]);

  const itemCount = items.reduce((sum, i) => sum + i.quantity, 0);
  const subtotal = items.reduce((sum, i) => sum + parseFloat(i.price) * i.quantity, 0);

  return (
    <CartContext.Provider value={{ items, itemCount, subtotal, checkoutLoading, addItem, updateQty, removeItem, checkout }}>
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
