/**
 * Shopify Blog Admin API Integration
 * Uses Admin API for reliable access to blog articles
 * This ensures consistency between Shopify and Vercel
 */

export interface BlogPost {
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  coverImage: string;
  date: string;
  author: {
    name: string;
    avatar: string;
  };
  category: string;
  tags: string[];
  readingTime: number;
  featured: boolean;
}

interface ShopifyArticleNode {
  id: string;
  handle: string;
  title: string;
  excerpt: string | null;
  contentHtml: string;
  publishedAt: string;
  tags: string[];
  image: {
    url: string;
    altText: string | null;
  } | null;
  author: {
    name: string;
  };
}

const SHOPIFY_ADMIN_DOMAIN = 'autonord-service.myshopify.com';
const SHOPIFY_ADMIN_TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;

/**
 * Fetch from Shopify Admin API
 */
async function adminFetch(query: string, variables?: Record<string, unknown>) {
  const url = `https://${SHOPIFY_ADMIN_DOMAIN}/admin/api/2024-01/graphql.json`;
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': SHOPIFY_ADMIN_TOKEN,
      },
      body: JSON.stringify({ query, variables }),
      cache: 'no-store',
    });

    if (!response.ok) {
      console.error('[ShopifyBlogAdmin] HTTP Error:', response.status);
      return null;
    }

    const json = await response.json();

    if (json.errors) {
      console.error('[ShopifyBlogAdmin] GraphQL Errors:', json.errors);
      return null;
    }

    return json.data;
  } catch (error) {
    console.error('[ShopifyBlogAdmin] Fetch Error:', error);
    return null;
  }
}

/**
 * Estimate reading time from HTML content
 */
function estimateReadingTime(html: string): number {
  const text = html.replace(/<[^>]*>/g, '');
  const words = text.split(/\s+/).length;
  return Math.max(1, Math.ceil(words / 200));
}

/**
 * Map category from tags
 */
function mapCategory(tags: string[]): string {
  const tagLower = tags.map(t => t.toLowerCase());
  
  // Check for specific category tags first
  if (tagLower.includes('prezzi-e-costi')) return 'prezzi';
  if (tagLower.includes('problemi-e-soluzioni')) return 'problemi';
  if (tagLower.includes('confronti')) return 'confronti';
  if (tagLower.includes('recensioni')) return 'recensioni';
  if (tagLower.includes('guide-pratiche')) return 'guide';
  
  // Fallback to keyword matching
  if (tagLower.some(t => t.includes('confronto') || t.includes('vs'))) return 'confronti';
  if (tagLower.some(t => t.includes('prezzo') || t.includes('costo'))) return 'prezzi';
  if (tagLower.some(t => t.includes('problema') || t.includes('soluzione') || t.includes('troubleshooting'))) return 'problemi';
  if (tagLower.some(t => t.includes('recensione') || t.includes('migliori') || t.includes('classifica'))) return 'recensioni';
  if (tagLower.some(t => t.includes('guida') || t.includes('tutorial') || t.includes('come-fare'))) return 'guide';
  
  return 'guide';
}

/**
 * Transform Shopify Admin article to BlogPost format
 */
function transformArticle(article: ShopifyArticleNode): BlogPost {
  return {
    slug: article.handle,
    title: article.title,
    excerpt: article.excerpt || '',
    content: article.contentHtml,
    coverImage: article.image?.url || '/blog/default-cover.jpg',
    date: article.publishedAt.split('T')[0],
    author: {
      name: article.author?.name || 'Team Autonord',
      avatar: '/team/autonord-avatar.jpg',
    },
    category: mapCategory(article.tags),
    tags: article.tags,
    readingTime: estimateReadingTime(article.contentHtml),
    featured: article.tags.some(t => 
      t.toLowerCase().includes('featured') || 
      t.toLowerCase().includes('in-evidenza') ||
      t.toLowerCase().includes('evidenza')
    ),
  };
}

const ALL_ARTICLES_QUERY = `
  query GetAllArticles {
    articles(first: 100, sortKey: PUBLISHED_AT, reverse: true) {
      edges {
        node {
          id
          handle
          title
          excerpt
          contentHtml
          publishedAt
          tags
          image {
            url
            altText
          }
          author {
            name
          }
        }
      }
    }
  }
`;

const ARTICLE_BY_HANDLE_QUERY = `
  query GetArticleByHandle($query: String!) {
    articles(first: 1, query: $query) {
      edges {
        node {
          id
          handle
          title
          excerpt
          contentHtml
          publishedAt
          tags
          image {
            url
            altText
          }
          author {
            name
          }
        }
      }
    }
  }
`;

/**
 * Get all articles from Shopify using Admin API
 */
export async function getAllArticlesAdmin(): Promise<BlogPost[]> {
  try {
    const data = await adminFetch(ALL_ARTICLES_QUERY);

    if (!data?.articles?.edges) {
      console.log('[ShopifyBlogAdmin] No articles found');
      return [];
    }

    const articles = data.articles.edges.map(({ node }: { node: ShopifyArticleNode }) => 
      transformArticle(node)
    );

    console.log(`[ShopifyBlogAdmin] Fetched ${articles.length} articles`);
    return articles;
  } catch (error) {
    console.error('[ShopifyBlogAdmin] Error fetching all articles:', error);
    return [];
  }
}

/**
 * Get featured articles
 */
export async function getFeaturedArticlesAdmin(): Promise<BlogPost[]> {
  const allArticles = await getAllArticlesAdmin();
  return allArticles.filter(article => article.featured);
}

/**
 * Get a single article by handle
 */
export async function getArticleByHandleAdmin(handle: string): Promise<BlogPost | null> {
  try {
    const data = await adminFetch(ARTICLE_BY_HANDLE_QUERY, { query: `handle:${handle}` });

    const article = data?.articles?.edges?.[0]?.node;
    
    if (!article) {
      console.log('[ShopifyBlogAdmin] Article not found:', handle);
      return null;
    }

    return transformArticle(article);
  } catch (error) {
    console.error('[ShopifyBlogAdmin] Error fetching article:', error);
    return null;
  }
}

/**
 * Get related articles based on tags
 */
export async function getRelatedArticlesAdmin(currentSlug: string, tags: string[], limit: number = 3): Promise<BlogPost[]> {
  const allArticles = await getAllArticlesAdmin();
  
  return allArticles
    .filter(article => article.slug !== currentSlug)
    .filter(article => article.tags.some(tag => tags.includes(tag)))
    .slice(0, limit);
}

/**
 * Get articles by category
 */
export async function getArticlesByCategoryAdmin(category: string): Promise<BlogPost[]> {
  const allArticles = await getAllArticlesAdmin();
  return allArticles.filter(article => article.category === category);
}
