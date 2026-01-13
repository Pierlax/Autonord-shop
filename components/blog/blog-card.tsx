'use client';

import Link from 'next/link';
import Image from 'next/image';
import { BlogPost } from '@/lib/blog/types';
import { Clock, Calendar, ArrowRight, Tag } from 'lucide-react';

interface BlogCardProps {
  post: BlogPost;
  featured?: boolean;
}

const categoryColors: Record<string, string> = {
  prezzi: 'bg-green-500/20 text-green-400 border-green-500/30',
  problemi: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  confronti: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  recensioni: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  guide: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
};

const categoryLabels: Record<string, string> = {
  prezzi: 'Prezzi e Costi',
  problemi: 'Problemi e Soluzioni',
  confronti: 'Confronti',
  recensioni: 'Recensioni',
  guide: 'Guide Pratiche',
};

export function BlogCard({ post, featured = false }: BlogCardProps) {
  const formattedDate = new Date(post.date).toLocaleDateString('it-IT', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  if (featured) {
    return (
      <Link href={`/blog/${post.slug}`} className="group block">
        <article className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-zinc-800 to-zinc-900 border border-zinc-700/50 hover:border-red-500/50 transition-all duration-300">
          <div className="grid md:grid-cols-2 gap-0">
            {/* Image */}
            <div className="relative h-64 md:h-full min-h-[300px] overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-t from-zinc-900 via-transparent to-transparent z-10 md:bg-gradient-to-r" />
              <Image
                src={post.coverImage}
                alt={post.title}
                fill
                className="object-cover group-hover:scale-105 transition-transform duration-500"
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  target.src = '/placeholder-blog.jpg';
                }}
              />
              <div className="absolute top-4 left-4 z-20">
                <span className="px-3 py-1 text-xs font-semibold bg-red-600 text-white rounded-full">
                  In Evidenza
                </span>
              </div>
            </div>
            
            {/* Content */}
            <div className="p-6 md:p-8 flex flex-col justify-center">
              <div className="flex items-center gap-3 mb-4">
                <span className={`px-3 py-1 text-xs font-medium rounded-full border ${categoryColors[post.category]}`}>
                  {categoryLabels[post.category]}
                </span>
              </div>
              
              <h2 className="text-2xl md:text-3xl font-bold text-white mb-4 group-hover:text-red-400 transition-colors line-clamp-3">
                {post.title}
              </h2>
              
              <p className="text-zinc-400 mb-6 line-clamp-3">
                {post.excerpt}
              </p>
              
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4 text-sm text-zinc-500">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-4 h-4" />
                    {formattedDate}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-4 h-4" />
                    {post.readingTime} min
                  </span>
                </div>
                
                <span className="flex items-center gap-2 text-red-400 font-medium group-hover:gap-3 transition-all">
                  Leggi <ArrowRight className="w-4 h-4" />
                </span>
              </div>
            </div>
          </div>
        </article>
      </Link>
    );
  }

  return (
    <Link href={`/blog/${post.slug}`} className="group block h-full">
      <article className="h-full flex flex-col overflow-hidden rounded-xl bg-zinc-800/50 border border-zinc-700/50 hover:border-red-500/50 hover:bg-zinc-800 transition-all duration-300">
        {/* Image */}
        <div className="relative h-48 overflow-hidden">
          <Image
            src={post.coverImage}
            alt={post.title}
            fill
            className="object-cover group-hover:scale-105 transition-transform duration-500"
            onError={(e) => {
              const target = e.target as HTMLImageElement;
              target.src = '/placeholder-blog.jpg';
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-zinc-900 via-transparent to-transparent" />
          <div className="absolute bottom-3 left-3">
            <span className={`px-2 py-1 text-xs font-medium rounded-full border ${categoryColors[post.category]}`}>
              {categoryLabels[post.category]}
            </span>
          </div>
        </div>
        
        {/* Content */}
        <div className="flex-1 p-5 flex flex-col">
          <h3 className="text-lg font-bold text-white mb-2 group-hover:text-red-400 transition-colors line-clamp-2">
            {post.title}
          </h3>
          
          <p className="text-sm text-zinc-400 mb-4 line-clamp-2 flex-1">
            {post.excerpt}
          </p>
          
          <div className="flex items-center justify-between pt-4 border-t border-zinc-700/50">
            <div className="flex items-center gap-3 text-xs text-zinc-500">
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {formattedDate}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {post.readingTime} min
              </span>
            </div>
            
            <ArrowRight className="w-4 h-4 text-zinc-500 group-hover:text-red-400 group-hover:translate-x-1 transition-all" />
          </div>
        </div>
      </article>
    </Link>
  );
}

export function BlogCardSkeleton() {
  return (
    <div className="h-full flex flex-col overflow-hidden rounded-xl bg-zinc-800/50 border border-zinc-700/50 animate-pulse">
      <div className="h-48 bg-zinc-700" />
      <div className="flex-1 p-5 flex flex-col">
        <div className="h-6 bg-zinc-700 rounded mb-2 w-3/4" />
        <div className="h-4 bg-zinc-700 rounded mb-1 w-full" />
        <div className="h-4 bg-zinc-700 rounded mb-4 w-2/3" />
        <div className="mt-auto pt-4 border-t border-zinc-700/50 flex justify-between">
          <div className="h-3 bg-zinc-700 rounded w-24" />
          <div className="h-3 bg-zinc-700 rounded w-16" />
        </div>
      </div>
    </div>
  );
}
