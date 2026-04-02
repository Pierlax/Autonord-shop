/**
 * Shopify Storefront Cart API
 * Uses cartCreate / cartLinesAdd / cartLinesUpdate / cartLinesRemove mutations.
 * Cart ID is persisted in localStorage by the CartContext.
 */

const domain = process.env.NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN;
const storefrontAccessToken = process.env.NEXT_PUBLIC_SHOPIFY_STOREFRONT_ACCESS_TOKEN;

// =============================================================================
// TYPES
// =============================================================================

export interface CartLineItem {
  id: string;
  quantity: number;
  merchandise: {
    id: string;
    title: string;
    price: { amount: string; currencyCode: string };
    product: {
      title: string;
      handle: string;
      featuredImage: { url: string; altText: string | null } | null;
    };
  };
}

export interface Cart {
  id: string;
  checkoutUrl: string;
  totalQuantity: number;
  lines: { edges: { node: CartLineItem }[] };
  cost: {
    totalAmount: { amount: string; currencyCode: string };
    subtotalAmount: { amount: string; currencyCode: string };
  };
}

// =============================================================================
// INTERNAL FETCH
// =============================================================================

async function storefrontFetch<T>(query: string, variables?: object): Promise<T | null> {
  if (!domain || !storefrontAccessToken) {
    console.error('[Cart] Missing NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN or NEXT_PUBLIC_SHOPIFY_STOREFRONT_ACCESS_TOKEN');
    return null;
  }

  try {
    const res = await fetch(`https://${domain}/api/2024-01/graphql.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Storefront-Access-Token': storefrontAccessToken,
      },
      body: JSON.stringify({ query, variables }),
      cache: 'no-store',
    });

    if (!res.ok) {
      console.error(`[Cart] HTTP ${res.status}:`, await res.text());
      return null;
    }
    const json = await res.json();
    if (json.errors) {
      console.error('[Cart] GraphQL errors:', JSON.stringify(json.errors));
      return null;
    }
    return json.data as T;
  } catch (err) {
    console.error('[Cart] Fetch error:', err);
    return null;
  }
}

// =============================================================================
// FRAGMENTS
// =============================================================================

const CART_FRAGMENT = `
  fragment CartFields on Cart {
    id
    checkoutUrl
    totalQuantity
    cost {
      totalAmount { amount currencyCode }
      subtotalAmount { amount currencyCode }
    }
    lines(first: 100) {
      edges {
        node {
          id
          quantity
          merchandise {
            ... on ProductVariant {
              id
              title
              price { amount currencyCode }
              product {
                title
                handle
                featuredImage { url altText }
              }
            }
          }
        }
      }
    }
  }
`;

// =============================================================================
// API FUNCTIONS
// =============================================================================

export async function cartCreate(variantId: string, quantity: number): Promise<Cart | null> {
  const data = await storefrontFetch<{ cartCreate: { cart: Cart; userErrors: { message: string }[] } }>(`
    mutation CartCreate($lines: [CartLineInput!]!) {
      cartCreate(input: { lines: $lines }) {
        cart { ...CartFields }
        userErrors { message }
      }
    }
    ${CART_FRAGMENT}
  `, { lines: [{ merchandiseId: variantId, quantity }] });

  if (data?.cartCreate?.userErrors?.length) {
    console.error('[Cart] cartCreate errors:', data.cartCreate.userErrors);
    return null;
  }
  return data?.cartCreate?.cart ?? null;
}

export async function cartLinesAdd(cartId: string, variantId: string, quantity: number): Promise<Cart | null> {
  const data = await storefrontFetch<{ cartLinesAdd: { cart: Cart; userErrors: { message: string }[] } }>(`
    mutation CartLinesAdd($cartId: ID!, $lines: [CartLineInput!]!) {
      cartLinesAdd(cartId: $cartId, lines: $lines) {
        cart { ...CartFields }
        userErrors { message }
      }
    }
    ${CART_FRAGMENT}
  `, { cartId, lines: [{ merchandiseId: variantId, quantity }] });

  if (data?.cartLinesAdd?.userErrors?.length) {
    console.error('[Cart] cartLinesAdd errors:', data.cartLinesAdd.userErrors);
    return null;
  }
  return data?.cartLinesAdd?.cart ?? null;
}

export async function cartLinesUpdate(cartId: string, lineId: string, quantity: number): Promise<Cart | null> {
  const data = await storefrontFetch<{ cartLinesUpdate: { cart: Cart; userErrors: { message: string }[] } }>(`
    mutation CartLinesUpdate($cartId: ID!, $lines: [CartLineUpdateInput!]!) {
      cartLinesUpdate(cartId: $cartId, lines: $lines) {
        cart { ...CartFields }
        userErrors { message }
      }
    }
    ${CART_FRAGMENT}
  `, { cartId, lines: [{ id: lineId, quantity }] });

  return data?.cartLinesUpdate?.cart ?? null;
}

export async function cartLinesRemove(cartId: string, lineId: string): Promise<Cart | null> {
  const data = await storefrontFetch<{ cartLinesRemove: { cart: Cart; userErrors: { message: string }[] } }>(`
    mutation CartLinesRemove($cartId: ID!, $lineIds: [ID!]!) {
      cartLinesRemove(cartId: $cartId, lineIds: $lineIds) {
        cart { ...CartFields }
        userErrors { message }
      }
    }
    ${CART_FRAGMENT}
  `, { cartId, lineIds: [lineId] });

  return data?.cartLinesRemove?.cart ?? null;
}

export async function getCart(cartId: string): Promise<Cart | null> {
  const data = await storefrontFetch<{ cart: Cart | null }>(`
    query GetCart($cartId: ID!) {
      cart(id: $cartId) { ...CartFields }
    }
    ${CART_FRAGMENT}
  `, { cartId });

  return data?.cart ?? null;
}
