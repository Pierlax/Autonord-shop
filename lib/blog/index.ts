/**
 * Blog Posts - Shopify Data Only
 * 
 * All blog content comes from Shopify Blog API.
 * Static posts have been removed to ensure consistency.
 */

import { BlogPost } from './types';
import { getAllShopifyBlogArticles, getShopifyBlogArticle } from '../shopify/blog';

// Cache for Shopify articles
let shopifyArticlesCache: BlogPost[] | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Get all posts from Shopify
 * For server components only
 */
export async function getAllPostsAsync(): Promise<BlogPost[]> {
  try {
    // Check cache
    if (shopifyArticlesCache && Date.now() - cacheTimestamp < CACHE_TTL) {
      return shopifyArticlesCache;
    }
    
    // Fetch from Shopify
    const shopifyPosts = await getAllShopifyBlogArticles();
    
    // Update cache
    shopifyArticlesCache = shopifyPosts;
    cacheTimestamp = Date.now();
    
    // Sort by date descending
    return shopifyPosts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  } catch (error) {
    console.error('[Blog] Error fetching Shopify articles:', error);
    return [];
  }
}

/**
 * Get featured posts from Shopify
 */
export async function getFeaturedPostsAsync(): Promise<BlogPost[]> {
  const allPosts = await getAllPostsAsync();
  return allPosts.filter(post => post.featured);
}

/**
 * Get post by slug from Shopify
 */
export async function getPostBySlugAsync(slug: string): Promise<BlogPost | null> {
  try {
    // First check cache
    if (shopifyArticlesCache) {
      const cachedPost = shopifyArticlesCache.find(post => post.slug === slug);
      if (cachedPost) return cachedPost;
    }
    
    // Fetch from Shopify
    const shopifyPost = await getShopifyBlogArticle(slug);
    return shopifyPost;
  } catch (error) {
    console.error('[Blog] Error fetching Shopify article:', error);
    return null;
  }
}

/**
 * Get posts by category
 */
export async function getPostsByCategoryAsync(category: string): Promise<BlogPost[]> {
  const allPosts = await getAllPostsAsync();
  return allPosts.filter(post => post.category === category);
}

/**
 * Get related posts
 */
export async function getRelatedPostsAsync(currentSlug: string, limit: number = 3): Promise<BlogPost[]> {
  const allPosts = await getAllPostsAsync();
  const currentPost = allPosts.find(post => post.slug === currentSlug);
  
  if (!currentPost) return [];
  
  return allPosts
    .filter(post => post.slug !== currentSlug)
    .filter(post => 
      post.category === currentPost.category ||
      post.tags.some(tag => currentPost.tags.includes(tag))
    )
    .slice(0, limit);
}

// Re-export types
export type { BlogPost } from './types';
export { BLOG_CATEGORIES } from './types';
