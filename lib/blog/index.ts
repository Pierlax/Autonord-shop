/**
 * Blog Posts - Shopify Admin API
 * 
 * All blog content comes from Shopify Admin API for maximum consistency.
 * This ensures Vercel always shows the same articles as Shopify.
 */

import { BlogPost } from './types';
import { 
  getAllArticlesAdmin, 
  getFeaturedArticlesAdmin, 
  getArticleByHandleAdmin,
  getRelatedArticlesAdmin,
  getArticlesByCategoryAdmin 
} from '../shopify/blog-admin';

// Re-export types and categories
export type { BlogPost } from './types';
export { BLOG_CATEGORIES } from './types';

/**
 * Get all posts from Shopify Admin API
 * For server components only
 */
export async function getAllPostsAsync(): Promise<BlogPost[]> {
  return getAllArticlesAdmin();
}

/**
 * Get featured posts from Shopify Admin API
 */
export async function getFeaturedPostsAsync(): Promise<BlogPost[]> {
  return getFeaturedArticlesAdmin();
}

/**
 * Get a single post by slug
 */
export async function getPostBySlugAsync(slug: string): Promise<BlogPost | null> {
  return getArticleByHandleAdmin(slug);
}

/**
 * Get related posts based on tags
 */
export async function getRelatedPostsAsync(currentSlug: string, limit: number = 3): Promise<BlogPost[]> {
  // Get current post to find its tags
  const currentPost = await getArticleByHandleAdmin(currentSlug);
  if (!currentPost) return [];
  
  return getRelatedArticlesAdmin(currentSlug, currentPost.tags, limit);
}

/**
 * Get posts by category
 */
export async function getPostsByCategoryAsync(category: string): Promise<BlogPost[]> {
  return getArticlesByCategoryAdmin(category);
}
