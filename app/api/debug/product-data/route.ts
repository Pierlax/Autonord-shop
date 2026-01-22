import { NextRequest, NextResponse } from 'next/server';

const SHOPIFY_STORE = 'autonord-service.myshopify.com';
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;

export async function GET(request: NextRequest) {
  const handle = request.nextUrl.searchParams.get('handle') || 'adattatore-magnetico-milwaukee-shockwave-14-esagonale-150mm';
  
  const query = `
    query GetProductByHandle($query: String!) {
      products(first: 1, query: $query) {
        edges {
          node {
            id
            handle
            title
            featuredImage {
              url
              altText
              id
            }
            images(first: 10) {
              edges {
                node {
                  url
                  altText
                  id
                }
              }
            }
            media(first: 10) {
              edges {
                node {
                  ... on MediaImage {
                    id
                    status
                    mediaContentType
                    image {
                      url
                      altText
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  `;

  try {
    const response = await fetch(`https://${SHOPIFY_STORE}/admin/api/2024-01/graphql.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN!,
      },
      body: JSON.stringify({ query, variables: { query: `handle:${handle}` } }),
      cache: 'no-store',
    });

    const result = await response.json();
    
    if (result.errors) {
      return NextResponse.json({ error: result.errors }, { status: 500 });
    }

    const product = result.data?.products?.edges?.[0]?.node;
    
    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    return NextResponse.json({
      handle: product.handle,
      title: product.title,
      featuredImage: product.featuredImage,
      imagesCount: product.images.edges.length,
      images: product.images.edges.map((e: any) => ({
        id: e.node.id,
        url: e.node.url,
      })),
      mediaCount: product.media.edges.length,
      media: product.media.edges.map((e: any) => ({
        id: e.node.id,
        status: e.node.status,
        type: e.node.mediaContentType,
        url: e.node.image?.url,
      })),
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
