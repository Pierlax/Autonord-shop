import { Metadata } from 'next';
import Link from 'next/link';
import { getProducts } from '@/lib/shopify';
import { ProductCard } from '@/components/product/product-card';
import { Filter, ChevronRight, Package } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Catalogo Prodotti | Autonord Service',
  description: 'Sfoglia il nostro catalogo completo di elettroutensili, macchine movimento terra e attrezzature edili.',
};

type Props = {
  searchParams: { [key: string]: string | string[] | undefined };
};

export default async function ProductsPage({ searchParams }: Props) {
  const sortKey = typeof searchParams.sort === 'string' ? searchParams.sort : 'RELEVANCE';
  const query = typeof searchParams.q === 'string' ? searchParams.q : undefined;
  const vendor = typeof searchParams.vendor === 'string' ? searchParams.vendor : undefined;
  
  // Build query string for filtering
  let searchQuery = query;
  if (vendor) {
    searchQuery = vendor;
  }
  
  const products = await getProducts(sortKey, false, searchQuery);

  return (
    <div className="container px-4 md:px-8 py-6 md:py-8">
      {/* Breadcrumbs */}
      <nav className="flex items-center text-sm text-muted-foreground mb-6">
        <Link href="/" className="hover:text-primary transition-colors">Home</Link>
        <ChevronRight className="h-4 w-4 mx-2" />
        <span className="text-foreground font-medium">Prodotti</span>
        {vendor && (
          <>
            <ChevronRight className="h-4 w-4 mx-2" />
            <span className="text-foreground font-medium">{vendor}</span>
          </>
        )}
      </nav>

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">
            {vendor ? vendor : query ? `Risultati per "${query}"` : 'Catalogo Prodotti'}
          </h1>
          <p className="text-muted-foreground mt-1">
            {products.length} {products.length === 1 ? 'prodotto trovato' : 'prodotti trovati'}
          </p>
        </div>
        
        <div className="flex items-center gap-4">
          <button className="inline-flex items-center justify-center rounded-lg border border-input bg-background px-4 py-2.5 text-sm font-medium shadow-sm hover:bg-accent hover:text-accent-foreground transition-colors">
            <Filter className="mr-2 h-4 w-4" />
            Filtri
          </button>
        </div>
      </div>

      {products.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      ) : (
        <div className="col-span-full text-center py-16 bg-muted/30 rounded-xl">
          <Package className="w-16 h-16 mx-auto text-muted-foreground/50 mb-4" />
          <p className="text-lg font-medium text-foreground mb-2">Nessun prodotto trovato</p>
          <p className="text-muted-foreground mb-4">
            {query ? `Nessun risultato per "${query}"` : 'Il catalogo è vuoto al momento.'}
          </p>
          <Link 
            href="/products" 
            className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Vedi tutti i prodotti
          </Link>
        </div>
      )}
    </div>
  );
}
