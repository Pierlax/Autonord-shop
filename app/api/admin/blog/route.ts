/**
 * Admin Blog API
 * Returns draft (unpublished) articles from Shopify for the admin dashboard.
 */

import { NextRequest, NextResponse } from 'next/server';
import { env, optionalEnv } from '@/lib/env';

const SHOPIFY_STORE = optionalEnv.SHOPIFY_SHOP_DOMAIN ?? 'autonord-service.myshopify.com';

function isAuthorized(request: NextRequest): boolean {
  const secret = env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  const urlSecret = new URL(request.url).searchParams.get('secret');
  if (authHeader === `Bearer ${secret}`) return true;
  if (urlSecret === secret) return true;
  if (process.env.NODE_ENV === 'development') return true;
  return false;
}

interface ShopifyDraftArticle {
  id: number;
  title: string;
  handle: string;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  tags: string;
  blog_id: number;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const accessToken = env.SHOPIFY_ADMIN_ACCESS_TOKEN;

    const response = await fetch(
      `https://${SHOPIFY_STORE}/admin/api/2024-01/articles.json?published_status=unpublished&limit=20&order=created_at+DESC`,
      {
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json',
        },
        cache: 'no-store',
      }
    );

    if (!response.ok) {
      const text = await response.text();
      return NextResponse.json(
        { error: `Shopify API error: ${response.status} — ${text}` },
        { status: 502 }
      );
    }

    const data = await response.json();
    const articles: ShopifyDraftArticle[] = data.articles ?? [];

    return NextResponse.json({
      success: true,
      drafts: articles.map(a => ({
        id: a.id,
        title: a.title,
        handle: a.handle,
        createdAt: a.created_at,
        tags: a.tags ? a.tags.split(', ') : [],
        adminUrl: `https://${SHOPIFY_STORE}/admin/blogs/${a.blog_id}/articles/${a.id}`,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
