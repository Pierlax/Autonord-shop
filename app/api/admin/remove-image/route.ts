import { NextRequest, NextResponse } from 'next/server';

const SHOPIFY_STORE = 'autonord-service.myshopify.com';
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN!;

export async function POST(request: NextRequest) {
  const productId = request.nextUrl.searchParams.get('productId');
  
  if (!productId) {
    return NextResponse.json({ error: 'Missing productId' }, { status: 400 });
  }

  const getMediaQuery = `
    query getProductMedia($id: ID!) {
      product(id: $id) {
        media(first: 10) {
          edges {
            node {
              id
            }
          }
        }
      }
    }
  `;

  try {
    const getResponse = await fetch(
      `https://${SHOPIFY_STORE}/admin/api/2024-01/graphql.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
        },
        body: JSON.stringify({ query: getMediaQuery, variables: { id: productId } }),
      }
    );

    const getData = await getResponse.json();
    const mediaIds = getData.data?.product?.media?.edges?.map((e: any) => e.node.id) || [];

    if (mediaIds.length === 0) {
      return NextResponse.json({ message: 'No media to remove', productId });
    }

    const deleteQuery = `
      mutation productDeleteMedia($productId: ID!, $mediaIds: [ID!]!) {
        productDeleteMedia(productId: $productId, mediaIds: $mediaIds) {
          deletedMediaIds
          mediaUserErrors {
            field
            message
          }
        }
      }
    `;

    const deleteResponse = await fetch(
      `https://${SHOPIFY_STORE}/admin/api/2024-01/graphql.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
        },
        body: JSON.stringify({ 
          query: deleteQuery, 
          variables: { productId, mediaIds } 
        }),
      }
    );

    const deleteData = await deleteResponse.json();
    
    return NextResponse.json({
      success: true,
      productId,
      deletedMediaIds: deleteData.data?.productDeleteMedia?.deletedMediaIds || [],
      errors: deleteData.data?.productDeleteMedia?.mediaUserErrors || [],
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
