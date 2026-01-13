'use client';

import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, BookOpen } from 'lucide-react';
import { blogPosts } from '@/lib/blog/posts';
import { BlogPost } from '@/lib/blog/types';

interface RelatedArticlesProps {
  productTitle: string;
  brandName: string;
  productTags?: string[];
}

// Find articles that might be related to this product
function findRelatedArticles(productTitle: string, brandName: string, productTags?: string[]): BlogPost[] {
  const titleLower = productTitle.toLowerCase();
  const brandLower = brandName.toLowerCase();
  
  // Keywords to match
  const keywords: string[] = [];
  
  // Add brand name
  if (brandLower.includes('milwaukee')) keywords.push('milwaukee', 'm18', 'm12');
  if (brandLower.includes('makita')) keywords.push('makita', '40v', 'lxt');
  if (brandLower.includes('bosch')) keywords.push('bosch');
  if (brandLower.includes('dewalt')) keywords.push('dewalt');
  if (brandLower.includes('hilti')) keywords.push('hilti');
  
  // Add product type keywords
  if (titleLower.includes('avvitatore') || titleLower.includes('impulsi')) keywords.push('avvitatore', 'impulsi');
  if (titleLower.includes('tassellatore') || titleLower.includes('martello')) keywords.push('tassellatore', 'surriscalda');
  if (titleLower.includes('trapano')) keywords.push('trapano');
  if (titleLower.includes('smerigliatrice')) keywords.push('smerigliatrice', 'disco', 'diamantato');
  if (titleLower.includes('disco')) keywords.push('disco', 'diamantato');
  
  // Find matching articles
  const matches = blogPosts.filter(post => {
    const postContent = `${post.title} ${post.excerpt} ${post.tags.join(' ')}`.toLowerCase();
    return keywords.some(keyword => postContent.includes(keyword));
  });
  
  // Return up to 2 related articles
  return matches.slice(0, 2);
}

export function RelatedArticles({ productTitle, brandName, productTags }: RelatedArticlesProps) {
  const relatedArticles = findRelatedArticles(productTitle, brandName, productTags);
  
  if (relatedArticles.length === 0) {
    return null;
  }

  return (
    <section className="mt-12 pt-8 border-t border-border">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center">
          <BookOpen className="w-5 h-5 text-blue-500" />
        </div>
        <h2 className="text-xl font-bold text-foreground">
          Approfondimenti Correlati
        </h2>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {relatedArticles.map((article) => (
          <Link
            key={article.slug}
            href={`/blog/${article.slug}`}
            className="group flex gap-4 p-4 rounded-xl border border-border bg-card hover:border-primary/50 hover:bg-muted/30 transition-all"
          >
            {/* Thumbnail */}
            <div className="relative w-24 h-24 flex-shrink-0 rounded-lg overflow-hidden bg-muted">
              <Image
                src={article.coverImage}
                alt={article.title}
                fill
                className="object-cover group-hover:scale-105 transition-transform duration-300"
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  target.src = '/placeholder-blog.jpg';
                }}
              />
            </div>
            
            {/* Content */}
            <div className="flex-1 min-w-0">
              <span className="text-xs font-medium text-primary uppercase tracking-wide">
                {article.category === 'confronti' ? 'Confronto' : 
                 article.category === 'recensioni' ? 'Recensione' :
                 article.category === 'problemi' ? 'Guida' :
                 article.category === 'prezzi' ? 'Prezzi' : 'Articolo'}
              </span>
              <h3 className="font-semibold text-foreground text-sm mt-1 line-clamp-2 group-hover:text-primary transition-colors">
                {article.title}
              </h3>
              <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                {article.readingTime} min di lettura
              </p>
            </div>
            
            {/* Arrow */}
            <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all flex-shrink-0 self-center" />
          </Link>
        ))}
      </div>

      {/* Link to all articles */}
      <div className="mt-4 text-center">
        <Link
          href="/blog"
          className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
        >
          Scopri tutti gli articoli del nostro blog
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </section>
  );
}
