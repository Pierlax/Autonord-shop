import { Product, Collection } from './types';

const domain = process.env.NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN;
const storefrontAccessToken = process.env.NEXT_PUBLIC_SHOPIFY_STOREFRONT_ACCESS_TOKEN;

async function ShopifyData(query: string, variables?: object) {
  if (!domain || !storefrontAccessToken) {
    console.warn("Missing Shopify API keys");
    return null;
  }

  const url = `https://${domain}/api/2024-01/graphql.json`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Storefront-Access-Token': storefrontAccessToken,
      },
      body: JSON.stringify({ query, variables }),
      cache: 'no-store', // Ensure fresh data for B2B stock
    });

    if (!response.ok) {
      console.error(`Shopify API HTTP Error: ${response.status}`);
      return null;
    }

    const json = await response.json();

    if (json.errors) {
      console.error('Shopify API Errors:', json.errors);
      return null;
    }

    return json.data;
  } catch (error) {
    console.error('Shopify Fetch Error:', error);
    return null;
  }
}

// Fragments
const productFragment = `
  fragment ProductFragment on Product {
    id
    handle
    availableForSale
    title
    description
    descriptionHtml
    vendor
    productType
    totalInventory
    options {
      id
      name
      values
    }
    priceRange {
      maxVariantPrice {
        amount
        currencyCode
      }
      minVariantPrice {
        amount
        currencyCode
      }
    }
    variants(first: 10) {
      edges {
        node {
          id
          title
          availableForSale
          quantityAvailable
          sku
          selectedOptions {
            name
            value
          }
          price {
            amount
            currencyCode
          }
          compareAtPrice {
            amount
            currencyCode
          }
          image {
            url
            altText
            width
            height
          }
        }
      }
    }
    featuredImage {
      url
      altText
      width
      height
    }
    images(first: 10) {
      edges {
        node {
          url
          altText
          width
          height
        }
      }
    }
    seo {
      title
      description
    }
    tags
    updatedAt
  }
`;

export async function getProducts(sortKey = 'RELEVANCE', reverse = false, query?: string): Promise<Product[]> {
  const res = await ShopifyData(`
    query getProducts($sortKey: ProductSortKeys, $reverse: Boolean, $query: String) {
      products(first: 100, sortKey: $sortKey, reverse: $reverse, query: $query) {
        edges {
          node {
            ...ProductFragment
          }
        }
      }
    }
    ${productFragment}
  `, { sortKey, reverse, query });

  return res?.products?.edges?.map((edge: any) => edge.node) || [];
}

export async function getProductByHandle(handle: string): Promise<Product | undefined> {
  const res = await ShopifyData(`
    query getProductByHandle($handle: String!) {
      product(handle: $handle) {
        ...ProductFragment
      }
    }
    ${productFragment}
  `, { handle });

  return res?.product;
}

export async function createCheckout(variantId: string, quantity: number): Promise<string | null> {
  const query = `
    mutation checkoutCreate($input: CheckoutCreateInput!) {
      checkoutCreate(input: $input) {
        checkout {
          webUrl
        }
        checkoutUserErrors {
          code
          field
          message
        }
      }
    }
  `;

  const variables = {
    input: {
      lineItems: [{ variantId, quantity }]
    }
  };

  const res = await ShopifyData(query, variables);
  
  if (!res) return null;

  if (res.checkoutCreate.checkoutUserErrors.length > 0) {
    console.error("Checkout Errors:", res.checkoutCreate.checkoutUserErrors);
    return null;
  }

  return res.checkoutCreate.checkout.webUrl;
}
