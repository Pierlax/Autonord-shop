import { NextRequest, NextResponse } from 'next/server';

const SHOPIFY_STORE = 'autonord-service.myshopify.com';
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN!;

export async function GET(request: NextRequest) {
  const handle = request.nextUrl.searchParams.get('handle');
  
  if (!handle) {
    return NextResponse.json({ error: 'Missing handle parameter' }, { status: 400 });
  }

  const query = `
    query getProduct($handle: String!) {
      productByHandle(handle: $handle) {
        id
        handle
        title
        vendor
        tags
        descriptionHtml
        seo {
          title
          description
        }
        featuredImage {
          url
          altText
          id
        }
        images(first: 10) {
          edges {
            node {
              id
              url
              altText
            }
          }
        }
        media(first: 10) {
          edges {
            node {
              ... on MediaImage {
                id
                status
                image {
                  url
                  altText
                }
              }
            }
          }
        }
        metafields(first: 20) {
          edges {
            node {
              namespace
              key
              value
              type
            }
          }
        }
      }
    }
  `;

  try {
    const response = await fetch(
      `https://${SHOPIFY_STORE}/admin/api/2024-01/graphql.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
        },
        body: JSON.stringify({ query, variables: { handle } }),
      }
    );

    const data = await response.json();
    const product = data.data?.productByHandle;

    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    const analysis = {
      id: product.id,
      handle: product.handle,
      title: product.title,
      vendor: product.vendor,
      tags: product.tags,
      hasAIEnhanced: product.tags.includes('AI-Enhanced'),
      descriptionHtml: {
        length: product.descriptionHtml?.length || 0,
        preview: product.descriptionHtml?.substring(0, 500) || '',
        hasStructuredContent: product.descriptionHtml?.includes('Perché sceglierlo') || 
                              product.descriptionHtml?.includes('Da considerare'),
      },
      seo: product.seo,
      featuredImage: product.featuredImage,
      imagesCount: product.images.edges.length,
      images: product.images.edges.map((e: any) => ({
        id: e.node.id,
        url: e.node.url,
        altText: e.node.altText,
      })),
      mediaCount: product.media.edges.length,
      metafieldsCount: product.metafields.edges.length,
      metafields: product.metafields.edges.map((e: any) => ({
        namespace: e.node.namespace,
        key: e.node.key,
        type: e.node.type,
        valuePreview: e.node.value?.substring(0, 100),
      })),
      diagnosis: {
        textSavedCorrectly: (product.descriptionHtml?.length || 0) > 100,
        imageSavedCorrectly: product.featuredImage !== null,
        metafieldsSaved: product.metafields.edges.length > 0,
        tagsSaved: product.tags.includes('AI-Enhanced'),
      }
    };

    return NextResponse.json(analysis);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
