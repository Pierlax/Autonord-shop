/**
 * Blog Researcher - Shopify Blog API Integration
 * Creates draft articles in Shopify Blog
 */

import { ArticleDraft } from './drafting';

// Lazy initialization of Shopify config
function getShopifyConfig() {
  const shopDomain = process.env.SHOPIFY_SHOP_DOMAIN;
  const accessToken = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
  
  if (!shopDomain || !accessToken) {
    throw new Error('SHOPIFY_SHOP_DOMAIN and SHOPIFY_ADMIN_ACCESS_TOKEN must be set');
  }
  
  return { shopDomain, accessToken };
}

interface ShopifyBlog {
  id: number;
  handle: string;
  title: string;
}

interface ShopifyArticle {
  id: number;
  title: string;
  handle: string;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Make a request to Shopify Admin API
 */
async function shopifyAdminRequest<T>(
  endpoint: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
  body?: object
): Promise<T> {
  const { shopDomain, accessToken } = getShopifyConfig();
  
  const url = `https://${shopDomain}/admin/api/2024-01${endpoint}`;
  
  const response = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': accessToken,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Shopify API error ${response.status}: ${errorText}`);
  }

  return response.json();
}

/**
 * Get or create the main blog
 */
async function getOrCreateBlog(blogHandle: string = 'news'): Promise<ShopifyBlog> {
  console.log(`[ShopifyBlog] Looking for blog: ${blogHandle}`);
  
  // Get all blogs
  const { blogs } = await shopifyAdminRequest<{ blogs: ShopifyBlog[] }>('/blogs.json');
  
  // Find existing blog
  const existingBlog = blogs.find(b => b.handle === blogHandle);
  
  if (existingBlog) {
    console.log(`[ShopifyBlog] Found existing blog: ${existingBlog.title} (ID: ${existingBlog.id})`);
    return existingBlog;
  }
  
  // Create new blog if not found
  console.log(`[ShopifyBlog] Creating new blog: ${blogHandle}`);
  
  const { blog } = await shopifyAdminRequest<{ blog: ShopifyBlog }>('/blogs.json', 'POST', {
    blog: {
      title: 'Blog Autonord',
      handle: blogHandle,
    },
  });
  
  console.log(`[ShopifyBlog] Created blog: ${blog.title} (ID: ${blog.id})`);
  return blog;
}

/**
 * Create a draft article in Shopify
 */
export async function createDraftArticle(
  article: ArticleDraft,
  blogHandle: string = 'news'
): Promise<ShopifyArticle> {
  console.log(`[ShopifyBlog] Creating draft article: ${article.title}`);
  
  // Get the blog
  const blog = await getOrCreateBlog(blogHandle);
  
  // Create the article as draft (published_at = null)
  const { article: shopifyArticle } = await shopifyAdminRequest<{ article: ShopifyArticle }>(
    `/blogs/${blog.id}/articles.json`,
    'POST',
    {
      article: {
        title: article.title,
        handle: article.slug,
        body_html: article.content,
        summary_html: article.excerpt,
        tags: article.tags.join(', '),
        published: false, // Draft mode
        metafields: [
          {
            namespace: 'custom',
            key: 'meta_description',
            value: article.metaDescription,
            type: 'single_line_text_field',
          },
          {
            namespace: 'custom',
            key: 'read_time',
            value: article.estimatedReadTime.toString(),
            type: 'number_integer',
          },
          {
            namespace: 'custom',
            key: 'category',
            value: article.category,
            type: 'single_line_text_field',
          },
          {
            namespace: 'custom',
            key: 'ai_generated',
            value: 'true',
            type: 'boolean',
          },
          {
            namespace: 'custom',
            key: 'generated_at',
            value: new Date().toISOString(),
            type: 'date_time',
          },
        ],
      },
    }
  );
  
  console.log(`[ShopifyBlog] Created draft article: ${shopifyArticle.title} (ID: ${shopifyArticle.id})`);
  console.log(`[ShopifyBlog] Handle: ${shopifyArticle.handle}`);
  console.log(`[ShopifyBlog] Status: Draft (unpublished)`);
  
  return shopifyArticle;
}

/**
 * Get all draft articles (for review)
 */
export async function getDraftArticles(blogHandle: string = 'news'): Promise<ShopifyArticle[]> {
  const blog = await getOrCreateBlog(blogHandle);
  
  const { articles } = await shopifyAdminRequest<{ articles: ShopifyArticle[] }>(
    `/blogs/${blog.id}/articles.json?published_status=unpublished`
  );
  
  return articles;
}

/**
 * Publish an article
 */
export async function publishArticle(
  articleId: number,
  blogHandle: string = 'news'
): Promise<ShopifyArticle> {
  const blog = await getOrCreateBlog(blogHandle);
  
  const { article } = await shopifyAdminRequest<{ article: ShopifyArticle }>(
    `/blogs/${blog.id}/articles/${articleId}.json`,
    'PUT',
    {
      article: {
        id: articleId,
        published: true,
        published_at: new Date().toISOString(),
      },
    }
  );
  
  console.log(`[ShopifyBlog] Published article: ${article.title}`);
  return article;
}

/**
 * Delete an article
 */
export async function deleteArticle(
  articleId: number,
  blogHandle: string = 'news'
): Promise<void> {
  const blog = await getOrCreateBlog(blogHandle);
  
  await shopifyAdminRequest(
    `/blogs/${blog.id}/articles/${articleId}.json`,
    'DELETE'
  );
  
  console.log(`[ShopifyBlog] Deleted article ID: ${articleId}`);
}
