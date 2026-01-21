import Link from 'next/link';
import { Search, Package, BookOpen, ArrowRight } from 'lucide-react';
import { getProductsAdmin } from '@/lib/shopify/products-admin';
import { ProductCard } from '@/components/product/product-card';
import { getAllPostsAsync } from '@/lib/blog';
import { BlogCard } from '@/components/blog/blog-card';

interface SearchPageProps {
  searchParams: { q?: string };
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const query = searchParams.q?.toLowerCase() || '';
  
  // Search products
  const allProducts = await getProductsAdmin();
  const matchingProducts = query 
    ? allProducts.filter(product => 
        product.title.toLowerCase().includes(query) ||
        product.description?.toLowerCase().includes(query) ||
        product.vendor?.toLowerCase().includes(query) ||
        product.productType?.toLowerCase().includes(query)
      )
    : [];
  
  // Search blog articles from Shopify
  const allPosts = await getAllPostsAsync();
  const matchingArticles = query
    ? allPosts.filter(post =>
        post.title.toLowerCase().includes(query) ||
        post.excerpt.toLowerCase().includes(query) ||
        post.category.toLowerCase().includes(query) ||
        post.tags.some(tag => tag.toLowerCase().includes(query)) ||
        post.content.toLowerCase().includes(query)
      )
    : [];

  const totalResults = matchingProducts.length + matchingArticles.length;

  return (
    <div className="min-h-screen bg-background">
      {/* Search Header */}
      <div className="bg-zinc-900 py-8">
        <div className="container max-w-screen-xl px-4">
          <div className="flex items-center gap-3 mb-4">
            <Search className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold text-white">Risultati di Ricerca</h1>
          </div>
          {query && (
            <p className="text-zinc-400">
              {totalResults} risultati per "<span className="text-white font-medium">{searchParams.q}</span>"
            </p>
          )}
        </div>
      </div>

      <div className="container max-w-screen-xl px-4 py-8">
        {!query ? (
          <div className="text-center py-16">
            <Search className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Cerca prodotti e guide</h2>
            <p className="text-muted-foreground">
              Usa la barra di ricerca per trovare prodotti, guide e confronti.
            </p>
          </div>
        ) : totalResults === 0 ? (
          <div className="text-center py-16">
            <Search className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Nessun risultato trovato</h2>
            <p className="text-muted-foreground mb-6">
              Prova con termini di ricerca diversi o esplora le nostre categorie.
            </p>
            <div className="flex justify-center gap-4">
              <Link 
                href="/products" 
                className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
              >
                <Package className="h-4 w-4" />
                Vedi Prodotti
              </Link>
              <Link 
                href="/blog" 
                className="inline-flex items-center gap-2 px-4 py-2 border border-border rounded-md hover:bg-accent"
              >
                <BookOpen className="h-4 w-4" />
                Leggi Guide
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-12">
            {/* Blog Articles Section */}
            {matchingArticles.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <BookOpen className="h-5 w-5 text-primary" />
                    <h2 className="text-xl font-bold">Guide e Confronti</h2>
                    <span className="px-2 py-0.5 bg-primary/10 text-primary text-sm rounded-full">
                      {matchingArticles.length} risultati
                    </span>
                  </div>
                  <Link 
                    href="/blog" 
                    className="text-sm text-primary hover:underline flex items-center gap-1"
                  >
                    Vedi tutte le guide
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                  {matchingArticles.slice(0, 6).map((post) => (
                    <BlogCard key={post.slug} post={post} />
                  ))}
                </div>
                {matchingArticles.length > 6 && (
                  <div className="text-center mt-6">
                    <Link 
                      href={`/blog?q=${encodeURIComponent(query)}`}
                      className="text-primary hover:underline"
                    >
                      Vedi tutti i {matchingArticles.length} articoli →
                    </Link>
                  </div>
                )}
              </section>
            )}

            {/* Products Section */}
            {matchingProducts.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <Package className="h-5 w-5 text-primary" />
                    <h2 className="text-xl font-bold">Prodotti</h2>
                    <span className="px-2 py-0.5 bg-primary/10 text-primary text-sm rounded-full">
                      {matchingProducts.length} risultati
                    </span>
                  </div>
                  <Link 
                    href="/products" 
                    className="text-sm text-primary hover:underline flex items-center gap-1"
                  >
                    Vedi tutti i prodotti
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
                <div className="grid gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                  {matchingProducts.slice(0, 12).map((product) => (
                    <ProductCard key={product.id} product={product} />
                  ))}
                </div>
                {matchingProducts.length > 12 && (
                  <div className="text-center mt-6">
                    <Link 
                      href={`/products?q=${encodeURIComponent(query)}`}
                      className="text-primary hover:underline"
                    >
                      Vedi tutti i {matchingProducts.length} prodotti →
                    </Link>
                  </div>
                )}
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
