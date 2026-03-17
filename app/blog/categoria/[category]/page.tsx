import { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getPostsByCategoryAsync, BLOG_CATEGORIES } from '@/lib/blog';
import { BlogCard } from '@/components/blog/blog-card';
import { ChevronRight, TrendingUp, HelpCircle, Scale, Star, BookOpen } from 'lucide-react';

// Revalidate every 5 minutes to pick up new Shopify articles
export const revalidate = 300;

interface Props {
  params: { category: string };
}

const categoryIcons: Record<string, React.ReactNode> = {
  prezzi: <TrendingUp className="w-6 h-6" />,
  problemi: <HelpCircle className="w-6 h-6" />,
  confronti: <Scale className="w-6 h-6" />,
  recensioni: <Star className="w-6 h-6" />,
  guide: <BookOpen className="w-6 h-6" />,
};

export async function generateStaticParams() {
  return BLOG_CATEGORIES.map((cat) => ({ category: cat.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const categoryData = BLOG_CATEGORIES.find((c) => c.slug === params.category);
  if (!categoryData) return {};

  return {
    title: `${categoryData.name} | Blog Autonord Service`,
    description: categoryData.description,
  };
}

export default async function BlogCategoryPage({ params }: Props) {
  const categoryData = BLOG_CATEGORIES.find((c) => c.slug === params.category);

  if (!categoryData) {
    notFound();
  }

  const posts = await getPostsByCategoryAsync(params.category);

  const icon = categoryIcons[params.category];

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
            <Link href="/blog" className="hover:text-white transition-colors">Blog & Risorse</Link>
            <ChevronRight className="w-4 h-4" />
            <span className="text-white">{categoryData.name}</span>
          </nav>

          <div className="max-w-3xl">
            <div className="flex items-center gap-4 mb-4">
              <div className="p-3 rounded-xl bg-red-600/20 text-red-400">
                {icon}
              </div>
              <h1 className="text-4xl md:text-5xl font-bold text-white">
                {categoryData.name}
              </h1>
            </div>
            <p className="text-xl text-zinc-300">
              {categoryData.description}
            </p>
          </div>
        </div>
      </section>

      {/* Category Navigation */}
      <section className="py-6 border-y border-zinc-800">
        <div className="container mx-auto px-4">
          <div className="flex flex-wrap gap-3 justify-center">
            {BLOG_CATEGORIES.map((cat) => (
              <Link
                key={cat.slug}
                href={`/blog/categoria/${cat.slug}`}
                className={`flex items-center gap-2 px-4 py-2 rounded-full border transition-all ${
                  cat.slug === params.category
                    ? 'bg-red-600 border-red-600 text-white'
                    : 'bg-zinc-800 hover:bg-zinc-700 border-zinc-700 hover:border-red-500/50 text-zinc-300 hover:text-white'
                }`}
              >
                <span className="w-4 h-4">{categoryIcons[cat.slug]}</span>
                <span>{cat.name}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Posts Grid */}
      <section className="py-12">
        <div className="container mx-auto px-4">
          {posts.length > 0 ? (
            <>
              <h2 className="text-2xl font-bold text-white mb-8 flex items-center gap-3">
                <span className="w-1 h-8 bg-red-500 rounded-full" />
                {posts.length} {posts.length === 1 ? 'Articolo' : 'Articoli'} in {categoryData.name}
              </h2>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {posts.map((post) => (
                  <BlogCard key={post.slug} post={post} />
                ))}
              </div>
            </>
          ) : (
            <div className="text-center py-20">
              <div className="text-zinc-600 mb-4 flex justify-center">
                {icon}
              </div>
              <h2 className="text-2xl font-bold text-white mb-3">
                Nessun articolo ancora
              </h2>
              <p className="text-zinc-400 mb-8 max-w-md mx-auto">
                Stiamo preparando contenuti su <strong className="text-zinc-200">{categoryData.name}</strong>. Torna presto o esplora le altre categorie.
              </p>
              <Link
                href="/blog"
                className="inline-flex items-center gap-2 px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-colors"
              >
                Tutti gli Articoli
              </Link>
            </div>
          )}
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 bg-gradient-to-br from-red-900/30 to-zinc-900">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold text-white mb-4">
            Hai una Domanda su {categoryData.name}?
          </h2>
          <p className="text-zinc-300 mb-8 max-w-2xl mx-auto">
            Se non hai trovato risposta, scrivici. Crediamo che se un cliente ha una domanda, probabilmente ce l&apos;hanno in molti — e meriti un articolo dedicato.
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
