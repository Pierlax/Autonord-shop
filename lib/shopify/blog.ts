/**
 * Shopify Blog API Integration
 * Fetches blog articles from Shopify Storefront API
 */

import { shopifyFetch } from './index';

export interface ShopifyBlogArticle {
  id: string;
  handle: string;
  title: string;
  excerpt: string;
  contentHtml: string;
  publishedAt: string;
  tags: string[];
  image?: {
    url: string;
    altText: string | null;
  };
  authorV2?: {
    name: string;
  };
  blog: {
    handle: string;
    title: string;
  };
}

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

const ARTICLES_QUERY = `
  query GetArticles($first: Int!, $blogHandle: String!) {
    blog(handle: $blogHandle) {
      articles(first: $first, sortKey: PUBLISHED_AT, reverse: true) {
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
            authorV2 {
              name
            }
            blog {
              handle
              title
            }
          }
        }
      }
    }
  }
`;

const ARTICLE_BY_HANDLE_QUERY = `
  query GetArticleByHandle($blogHandle: String!, $articleHandle: String!) {
    blog(handle: $blogHandle) {
      articleByHandle(handle: $articleHandle) {
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
        authorV2 {
          name
        }
        blog {
          handle
          title
        }
      }
    }
  }
`;

const ALL_BLOGS_QUERY = `
  query GetAllBlogs {
    blogs(first: 10) {
      edges {
        node {
          handle
          title
          articles(first: 50, sortKey: PUBLISHED_AT, reverse: true) {
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
                authorV2 {
                  name
                }
                blog {
                  handle
                  title
                }
              }
            }
          }
        }
      }
    }
  }
`;

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
  
  if (tagLower.some(t => t.includes('confronto') || t.includes('vs'))) return 'confronti';
  if (tagLower.some(t => t.includes('prezzo') || t.includes('costo'))) return 'prezzi';
  if (tagLower.some(t => t.includes('problema') || t.includes('soluzione'))) return 'problemi';
  if (tagLower.some(t => t.includes('recensione') || t.includes('migliori'))) return 'recensioni';
  if (tagLower.some(t => t.includes('guida'))) return 'guide';
  
  return 'guide';
}

/**
 * Transform Shopify article to BlogPost format
 */
function transformArticle(article: ShopifyBlogArticle): BlogPost {
  return {
    slug: article.handle,
    title: article.title,
    excerpt: article.excerpt || '',
    content: article.contentHtml,
    coverImage: article.image?.url || '/blog/default-cover.jpg',
    date: article.publishedAt.split('T')[0],
    author: {
      name: article.authorV2?.name || 'Team Autonord',
      avatar: '/team/autonord-avatar.jpg',
    },
    category: mapCategory(article.tags),
    tags: article.tags,
    readingTime: estimateReadingTime(article.contentHtml),
    featured: article.tags.some(t => t.toLowerCase().includes('featured') || t.toLowerCase().includes('evidenza')),
  };
}

/**
 * Get all articles from Shopify Blog
 */
export async function getShopifyBlogArticles(blogHandle: string = 'news', limit: number = 50): Promise<BlogPost[]> {
  try {
    const data = await shopifyFetch(ARTICLES_QUERY, { first: limit, blogHandle });

    if (!data?.blog?.articles?.edges) {
      console.log('[ShopifyBlog] No articles found for blog:', blogHandle);
      return [];
    }

    return data.blog.articles.edges.map(({ node }: { node: ShopifyBlogArticle }) => transformArticle(node));
  } catch (error) {
    console.error('[ShopifyBlog] Error fetching articles:', error);
    return [];
  }
}

/**
 * Get all articles from all blogs
 */
export async function getAllShopifyBlogArticles(): Promise<BlogPost[]> {
  try {
    const data = await shopifyFetch(ALL_BLOGS_QUERY);

    if (!data?.blogs?.edges) {
      console.log('[ShopifyBlog] No blogs found');
      return [];
    }

    const allArticles: BlogPost[] = [];

    for (const blogEdge of data.blogs.edges) {
      for (const articleEdge of blogEdge.node.articles.edges) {
        allArticles.push(transformArticle(articleEdge.node));
      }
    }

    // Sort by date descending
    allArticles.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return allArticles;
  } catch (error) {
    console.error('[ShopifyBlog] Error fetching all articles:', error);
    return [];
  }
}

/**
 * Get a single article by handle
 */
export async function getShopifyBlogArticle(articleHandle: string, blogHandle: string = 'news'): Promise<BlogPost | null> {
  try {
    const data = await shopifyFetch(ARTICLE_BY_HANDLE_QUERY, { blogHandle, articleHandle });

    const article = data?.blog?.articleByHandle;
    
    if (!article) {
      console.log('[ShopifyBlog] Article not found:', articleHandle);
      return null;
    }

    return transformArticle(article);
  } catch (error) {
    console.error('[ShopifyBlog] Error fetching article:', error);
    return null;
  }
}
