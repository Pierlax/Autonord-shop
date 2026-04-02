/**
 * Blog Posts — Shopify Admin API (single source of truth)
 *
 * All blog content lives on Shopify. Next.js is a pure frontend.
 * Articles are created either manually via Shopify admin or automatically
 * by the blog-researcher AI pipeline (saved as drafts, published manually).
 */

import {
  getAllArticlesAdmin,
  getFeaturedArticlesAdmin,
  getArticleByHandleAdmin,
  getRelatedArticlesAdmin,
  getArticlesByCategoryAdmin,
} from '../shopify/blog-admin';

// Re-export types and categories
export type { BlogPost } from './types';
export { BLOG_CATEGORIES } from './types';

/**
 * Get all published posts, sorted by date descending
 */
export async function getAllPostsAsync() {
  return getAllArticlesAdmin();
}

/**
 * Get featured posts (tagged with "featured" / "in-evidenza" on Shopify)
 */
export async function getFeaturedPostsAsync() {
  return getFeaturedArticlesAdmin();
}

/**
 * Get a single post by slug — returns null if not found
 */
export async function getPostBySlugAsync(slug: string) {
  return getArticleByHandleAdmin(slug);
}

/**
 * Get related posts based on shared tags
 */
export async function getRelatedPostsAsync(currentSlug: string, limit = 3) {
  const currentPost = await getArticleByHandleAdmin(currentSlug);
  if (!currentPost) return [];
  return getRelatedArticlesAdmin(currentSlug, currentPost.tags, limit);
}

/**
 * Get posts filtered by category slug (prezzi, problemi, confronti, recensioni, guide)
 */
export async function getPostsByCategoryAsync(category: string) {
  return getArticlesByCategoryAdmin(category);
}
