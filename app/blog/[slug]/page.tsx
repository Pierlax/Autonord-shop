import { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { getPostBySlug, getRelatedPosts, getAllPosts } from '@/lib/blog/posts';
import { BlogCard } from '@/components/blog/blog-card';
import { BlogCoverImage } from '@/components/blog/blog-cover-image';
import { ChevronRight, Calendar, Clock, User, Share2, Facebook, Twitter, Linkedin, ArrowLeft } from 'lucide-react';
import { TLDRBox } from '@/components/blog/tldr-box';

interface BlogPostPageProps {
  params: { slug: string };
}

export async function generateStaticParams() {
  const posts = getAllPosts();
  return posts.map((post) => ({
    slug: post.slug,
  }));
}

export async function generateMetadata({ params }: BlogPostPageProps): Promise<Metadata> {
  const post = getPostBySlug(params.slug);
  
  if (!post) {
    return {
      title: 'Articolo non trovato | Autonord Service',
    };
  }

  return {
    title: `${post.title} | Autonord Service Blog`,
    description: post.excerpt,
    openGraph: {
      title: post.title,
      description: post.excerpt,
      type: 'article',
      publishedTime: post.date,
      authors: [post.author.name],
      images: [post.coverImage],
    },
  };
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

export default function BlogPostPage({ params }: BlogPostPageProps) {
  const post = getPostBySlug(params.slug);
  
  if (!post) {
    notFound();
  }

  const relatedPosts = getRelatedPosts(params.slug, 3);
  
  const formattedDate = new Date(post.date).toLocaleDateString('it-IT', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  // Simple markdown to HTML conversion for the content
  const renderContent = (content: string) => {
    return content
      .split('\n')
      .map((line, index) => {
        // Headers
        if (line.startsWith('# ')) {
          return <h1 key={index} className="text-3xl font-bold text-white mt-8 mb-4">{line.slice(2)}</h1>;
        }
        if (line.startsWith('## ')) {
          return <h2 key={index} className="text-2xl font-bold text-white mt-8 mb-4">{line.slice(3)}</h2>;
        }
        if (line.startsWith('### ')) {
          return <h3 key={index} className="text-xl font-bold text-white mt-6 mb-3">{line.slice(4)}</h3>;
        }
        
        // Tables
        if (line.startsWith('|')) {
          return null; // Tables handled separately
        }
        
        // Bold text
        let processedLine = line.replace(/\*\*(.*?)\*\*/g, '<strong class="text-white font-semibold">$1</strong>');
        
        // Lists
        if (line.startsWith('- ')) {
          return (
            <li key={index} className="text-zinc-300 ml-4 mb-2" 
                dangerouslySetInnerHTML={{ __html: processedLine.slice(2) }} />
          );
        }
        
        // Numbered lists
        const numberedMatch = line.match(/^(\d+)\.\s/);
        if (numberedMatch) {
          return (
            <li key={index} className="text-zinc-300 ml-4 mb-2 list-decimal" 
                dangerouslySetInnerHTML={{ __html: processedLine.slice(numberedMatch[0].length) }} />
          );
        }
        
        // Empty lines
        if (line.trim() === '') {
          return <br key={index} />;
        }
        
        // Regular paragraphs
        return (
          <p key={index} className="text-zinc-300 mb-4 leading-relaxed" 
             dangerouslySetInnerHTML={{ __html: processedLine }} />
        );
      });
  };

  // Extract tables from content
  const extractTables = (content: string) => {
    const lines = content.split('\n');
    const tables: string[][][] = [];
    let currentTable: string[][] = [];
    let inTable = false;

    lines.forEach((line) => {
      if (line.startsWith('|')) {
        inTable = true;
        const cells = line.split('|').filter(cell => cell.trim() !== '');
        if (!line.includes('---')) {
          currentTable.push(cells.map(cell => cell.trim()));
        }
      } else if (inTable && line.trim() === '') {
        if (currentTable.length > 0) {
          tables.push(currentTable);
          currentTable = [];
        }
        inTable = false;
      }
    });

    if (currentTable.length > 0) {
      tables.push(currentTable);
    }

    return tables;
  };

  const tables = extractTables(post.content);

  return (
    <div className="min-h-screen bg-zinc-900">
      {/* Hero Section */}
      <section className="relative py-12 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-red-900/20 via-zinc-900 to-zinc-900" />
        
        <div className="container mx-auto px-4 relative z-10">
          {/* Breadcrumb */}
          <nav className="flex items-center gap-2 text-sm text-zinc-400 mb-8">
            <Link href="/" className="hover:text-white transition-colors">Home</Link>
            <ChevronRight className="w-4 h-4" />
            <Link href="/blog" className="hover:text-white transition-colors">Blog</Link>
            <ChevronRight className="w-4 h-4" />
            <span className="text-zinc-500 truncate max-w-[200px]">{post.title}</span>
          </nav>

          {/* Back Link */}
          <Link 
            href="/blog" 
            className="inline-flex items-center gap-2 text-zinc-400 hover:text-white mb-6 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Torna al Blog
          </Link>

          {/* Category Badge */}
          <div className="mb-4">
            <span className={`px-3 py-1 text-sm font-medium rounded-full border ${categoryColors[post.category]}`}>
              {categoryLabels[post.category]}
            </span>
          </div>

          {/* Title */}
          <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-6 max-w-4xl">
            {post.title}
          </h1>

          {/* Meta */}
          <div className="flex flex-wrap items-center gap-6 text-zinc-400 mb-8">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4" />
              <span>{post.author.name}</span>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              <span>{formattedDate}</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4" />
              <span>{post.readingTime} min di lettura</span>
            </div>
          </div>

          {/* Tags */}
          <div className="flex flex-wrap gap-2">
            {post.tags.map((tag) => (
              <span 
                key={tag}
                className="px-3 py-1 text-xs bg-zinc-800 text-zinc-400 rounded-full"
              >
                #{tag}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Cover Image */}
      <section className="container mx-auto px-4 -mt-4 mb-12">
        <div className="relative h-64 md:h-96 lg:h-[500px] rounded-2xl overflow-hidden">
          <BlogCoverImage
            src={post.coverImage}
            alt={post.title}
            priority
          />
          <div className="absolute inset-0 bg-gradient-to-t from-zinc-900 via-transparent to-transparent" />
        </div>
      </section>

      {/* Content */}
      <section className="container mx-auto px-4 pb-16">
        <div className="grid lg:grid-cols-4 gap-12">
          {/* Main Content */}
          <article className="lg:col-span-3">
            {/* GAP 8: TL;DR Box at top of article */}
            <TLDRBox content={post.content} />
            
            <div className="prose prose-invert prose-lg max-w-none">
              {renderContent(post.content)}
              
              {/* Render Tables */}
              {tables.map((table, tableIndex) => (
                <div key={tableIndex} className="overflow-x-auto my-8">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr>
                        {table[0]?.map((cell, cellIndex) => (
                          <th 
                            key={cellIndex}
                            className="px-4 py-3 text-left text-sm font-semibold text-white bg-zinc-800 border border-zinc-700"
                          >
                            {cell}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {table.slice(1).map((row, rowIndex) => (
                        <tr key={rowIndex} className="hover:bg-zinc-800/50">
                          {row.map((cell, cellIndex) => (
                            <td 
                              key={cellIndex}
                              className="px-4 py-3 text-sm text-zinc-300 border border-zinc-700"
                            >
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>

            {/* Share */}
            <div className="mt-12 pt-8 border-t border-zinc-800">
              <div className="flex items-center gap-4">
                <span className="text-zinc-400 flex items-center gap-2">
                  <Share2 className="w-4 h-4" />
                  Condividi:
                </span>
                <div className="flex gap-3">
                  <a 
                    href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(`https://autonord-shop.vercel.app/blog/${post.slug}`)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 bg-zinc-800 hover:bg-blue-600 rounded-full transition-colors"
                  >
                    <Facebook className="w-5 h-5 text-white" />
                  </a>
                  <a 
                    href={`https://twitter.com/intent/tweet?url=${encodeURIComponent(`https://autonord-shop.vercel.app/blog/${post.slug}`)}&text=${encodeURIComponent(post.title)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 bg-zinc-800 hover:bg-sky-500 rounded-full transition-colors"
                  >
                    <Twitter className="w-5 h-5 text-white" />
                  </a>
                  <a 
                    href={`https://www.linkedin.com/shareArticle?mini=true&url=${encodeURIComponent(`https://autonord-shop.vercel.app/blog/${post.slug}`)}&title=${encodeURIComponent(post.title)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 bg-zinc-800 hover:bg-blue-700 rounded-full transition-colors"
                  >
                    <Linkedin className="w-5 h-5 text-white" />
                  </a>
                </div>
              </div>
            </div>
          </article>

          {/* Sidebar */}
          <aside className="lg:col-span-1">
            <div className="sticky top-24 space-y-8">
              {/* Author Card */}
              <div className="p-6 bg-zinc-800/50 rounded-xl border border-zinc-700">
                <h3 className="text-lg font-semibold text-white mb-4">Autore</h3>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-red-600 flex items-center justify-center text-white font-bold">
                    {post.author.name.charAt(0)}
                  </div>
                  <div>
                    <p className="font-medium text-white">{post.author.name}</p>
                    <p className="text-sm text-zinc-400">Autonord Service</p>
                  </div>
                </div>
              </div>

              {/* CTA Card */}
              <div className="p-6 bg-gradient-to-br from-red-900/50 to-zinc-800 rounded-xl border border-red-500/30">
                <h3 className="text-lg font-semibold text-white mb-2">Hai Domande?</h3>
                <p className="text-sm text-zinc-300 mb-4">
                  Contattaci per una consulenza gratuita sui prodotti citati in questo articolo.
                </p>
                <a 
                  href="https://wa.me/393331234567"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-full py-2 px-4 bg-green-600 hover:bg-green-700 text-white text-center font-medium rounded-lg transition-colors"
                >
                  Scrivici su WhatsApp
                </a>
              </div>

              {/* Table of Contents placeholder */}
              <div className="p-6 bg-zinc-800/50 rounded-xl border border-zinc-700">
                <h3 className="text-lg font-semibold text-white mb-4">In Questo Articolo</h3>
                <p className="text-sm text-zinc-400">
                  Scorri l'articolo per scoprire tutti i dettagli su questo argomento.
                </p>
              </div>
            </div>
          </aside>
        </div>
      </section>

      {/* Related Posts */}
      {relatedPosts.length > 0 && (
        <section className="py-16 bg-zinc-800/30">
          <div className="container mx-auto px-4">
            <h2 className="text-2xl font-bold text-white mb-8 flex items-center gap-3">
              <span className="w-1 h-8 bg-red-500 rounded-full" />
              Articoli Correlati
            </h2>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {relatedPosts.map((relatedPost) => (
                <BlogCard key={relatedPost.slug} post={relatedPost} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* CTA Section */}
      <section className="py-16 bg-gradient-to-br from-red-900/30 to-zinc-900">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold text-white mb-4">
            Pronto a Scegliere i Tuoi Utensili?
          </h2>
          <p className="text-zinc-300 mb-8 max-w-2xl mx-auto">
            Visita il nostro catalogo o contattaci per una consulenza personalizzata.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/products"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-colors"
            >
              Sfoglia il Catalogo
            </Link>
            <Link
              href="/contact"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-zinc-700 hover:bg-zinc-600 text-white font-semibold rounded-lg transition-colors"
            >
              Contattaci
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
