import { Metadata } from 'next';
import Link from 'next/link';
import { getAllPostsAsync, getFeaturedPostsAsync, BLOG_CATEGORIES } from '@/lib/blog';
import { BlogCard } from '@/components/blog/blog-card';
import { ChevronRight, BookOpen, TrendingUp, HelpCircle, Scale, Star } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Blog & Risorse | Autonord Service',
  description: 'Guide, confronti e recensioni oneste su utensili professionali. Rispondiamo alle domande che i nostri clienti ci fanno ogni giorno.',
};

// Revalidate every 5 minutes to pick up new Shopify articles
export const revalidate = 300;

const categoryIcons: Record<string, React.ReactNode> = {
  prezzi: <TrendingUp className="w-5 h-5" />,
  problemi: <HelpCircle className="w-5 h-5" />,
  confronti: <Scale className="w-5 h-5" />,
  recensioni: <Star className="w-5 h-5" />,
  guide: <BookOpen className="w-5 h-5" />,
};

export default async function BlogPage() {
  const [allPosts, featuredPosts] = await Promise.all([
    getAllPostsAsync(),
    getFeaturedPostsAsync(),
  ]);
  
  const regularPosts = allPosts.filter(post => !post.featured);

  return (
    <div className="min-h-screen bg-zinc-900">
      {/* Hero Section */}
      <section className="relative py-20 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-red-900/20 via-zinc-900 to-zinc-900" />
        <div className="absolute inset-0 bg-[url('/grid-pattern.svg')] opacity-5" />
        
        <div className="container mx-auto px-4 relative z-10">
          {/* Breadcrumb */}
          <nav className="flex items-center gap-2 text-sm text-zinc-400 mb-8">
            <Link href="/" className="hover:text-white transition-colors">Home</Link>
            <ChevronRight className="w-4 h-4" />
            <span className="text-white">Blog & Risorse</span>
          </nav>

          <div className="max-w-3xl">
            <h1 className="text-4xl md:text-5xl font-bold text-white mb-6">
              Blog & Risorse
            </h1>
            <p className="text-xl text-zinc-300 mb-4">
              <strong className="text-red-400">They Ask, You Answer.</strong> Rispondiamo alle domande che i nostri clienti ci fanno ogni giorno.
            </p>
            <p className="text-zinc-400">
              Guide trasparenti sui prezzi, soluzioni ai problemi comuni, confronti imparziali tra brand e recensioni oneste. Niente marketing, solo informazioni utili.
            </p>
          </div>
        </div>
      </section>

      {/* Categories */}
      <section className="py-8 border-y border-zinc-800">
        <div className="container mx-auto px-4">
          <div className="flex flex-wrap gap-3 justify-center">
            {BLOG_CATEGORIES.map((category) => (
              <Link
                key={category.slug}
                href={`/blog/categoria/${category.slug}`}
                className="flex items-center gap-2 px-4 py-2 rounded-full bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 hover:border-red-500/50 text-zinc-300 hover:text-white transition-all"
              >
                {categoryIcons[category.slug]}
                <span>{category.name}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Featured Posts */}
      {featuredPosts.length > 0 && (
        <section className="py-12">
          <div className="container mx-auto px-4">
            <h2 className="text-2xl font-bold text-white mb-8 flex items-center gap-3">
              <span className="w-1 h-8 bg-red-500 rounded-full" />
              In Evidenza
            </h2>
            <div className="space-y-6">
              {featuredPosts.map((post) => (
                <BlogCard key={post.slug} post={post} featured />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* All Posts Grid */}
      <section className="py-12">
        <div className="container mx-auto px-4">
          <h2 className="text-2xl font-bold text-white mb-8 flex items-center gap-3">
            <span className="w-1 h-8 bg-red-500 rounded-full" />
            Tutti gli Articoli
          </h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {regularPosts.map((post) => (
              <BlogCard key={post.slug} post={post} />
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 bg-gradient-to-br from-red-900/30 to-zinc-900">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold text-white mb-4">
            Hai una Domanda che Non Abbiamo Ancora Risposto?
          </h2>
          <p className="text-zinc-300 mb-8 max-w-2xl mx-auto">
            Scrivici la tua domanda e potremmo dedicarle un articolo completo. 
            Crediamo che se un cliente ha una domanda, probabilmente ce l'hanno in molti.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/contact"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-colors"
            >
              Facci una Domanda
            </Link>
            <a
              href="https://wa.me/393331234567"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg transition-colors"
            >
              Scrivici su WhatsApp
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
