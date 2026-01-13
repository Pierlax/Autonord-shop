import { Metadata } from 'next';
import { getProducts } from '@/lib/shopify';
import { ProductCard } from '@/components/product/product-card';
import { Filter } from 'lucide-react';

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
  
  const products = await getProducts(sortKey, false, query);

  return (
    <div className="container px-4 md:px-8 py-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold font-heading">CATALOGO PRODOTTI</h1>
          <p className="text-muted-foreground">
            {products.length} risultati trovati {query && `per "${query}"`}
          </p>
        </div>
        
        <div className="flex items-center gap-4">
          <button className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium shadow-sm hover:bg-accent hover:text-accent-foreground">
            <Filter className="mr-2 h-4 w-4" />
            Filtri
          </button>
          {/* Sort dropdown would go here */}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {products.length > 0 ? (
          products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))
        ) : (
          <div className="col-span-full text-center py-12">
            <p className="text-lg text-muted-foreground">Nessun prodotto trovato.</p>
          </div>
        )}
      </div>
    </div>
  );
}
