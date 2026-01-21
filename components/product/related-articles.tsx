'use client';

import Link from 'next/link';
import { ArrowRight, BookOpen } from 'lucide-react';

interface RelatedArticlesProps {
  productTitle: string;
  brandName: string;
  productTags?: string[];
}

/**
 * Related Articles Component
 * Shows a link to the blog section based on the product brand
 * Note: We can't fetch Shopify articles in a client component,
 * so we show a generic link to the blog filtered by brand
 */
export function RelatedArticles({ productTitle, brandName, productTags }: RelatedArticlesProps) {
  const brandLower = brandName.toLowerCase();
  
  // Determine which blog category/search to link to based on brand
  let blogLink = '/blog';
  let linkText = 'Scopri le nostre guide e confronti';
  
  if (brandLower.includes('milwaukee')) {
    blogLink = '/blog?q=milwaukee';
    linkText = 'Guide e confronti Milwaukee';
  } else if (brandLower.includes('makita')) {
    blogLink = '/blog?q=makita';
    linkText = 'Guide e confronti Makita';
  } else if (brandLower.includes('dewalt')) {
    blogLink = '/blog?q=dewalt';
    linkText = 'Guide e confronti DeWalt';
  } else if (brandLower.includes('bosch')) {
    blogLink = '/blog?q=bosch';
    linkText = 'Guide e confronti Bosch';
  } else if (brandLower.includes('hilti')) {
    blogLink = '/blog?q=hilti';
    linkText = 'Guide e confronti Hilti';
  }

  return (
    <section className="mt-12 pt-8 border-t border-border">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center">
          <BookOpen className="w-5 h-5 text-blue-500" />
        </div>
        <h2 className="text-xl font-bold text-foreground">
          Approfondimenti e Guide
        </h2>
      </div>

      <div className="p-6 rounded-xl border border-border bg-card hover:border-primary/50 hover:bg-muted/30 transition-all">
        <p className="text-muted-foreground mb-4">
          Scopri confronti imparziali, guide ai prezzi e soluzioni ai problemi più comuni nel nostro blog.
        </p>
        <Link
          href={blogLink}
          className="inline-flex items-center gap-2 text-primary font-medium hover:underline"
        >
          {linkText}
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>

      {/* Link to all articles */}
      <div className="mt-4 text-center">
        <Link
          href="/blog"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary"
        >
          Vedi tutti gli articoli del blog
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </section>
  );
}
