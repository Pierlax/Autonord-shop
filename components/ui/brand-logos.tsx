import Link from 'next/link';

const brands = [
  { name: 'Milwaukee', logo: '/brands/milwaukee.svg', url: '/products?vendor=milwaukee' },
  { name: 'Makita', logo: '/brands/makita.svg', url: '/products?vendor=makita' },
  { name: 'Bosch', logo: '/brands/bosch.svg', url: '/products?vendor=bosch' },
  { name: 'DeWalt', logo: '/brands/dewalt.svg', url: '/products?vendor=dewalt' },
  { name: 'Hilti', logo: '/brands/hilti.svg', url: '/products?vendor=hilti' },
  { name: 'Metabo', logo: '/brands/metabo.svg', url: '/products?vendor=metabo' },
];

export function BrandLogos() {
  return (
    <section className="container px-4 md:px-8 py-12">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold tracking-tight font-heading mb-2">I NOSTRI BRAND</h2>
        <p className="text-muted-foreground">Partner ufficiale dei migliori marchi mondiali</p>
      </div>
      
      <div className="grid grid-cols-3 md:grid-cols-6 gap-6 md:gap-8 items-center">
        {brands.map((brand) => (
          <Link
            key={brand.name}
            href={brand.url}
            className="group flex items-center justify-center p-4 md:p-6 rounded-xl bg-muted/30 hover:bg-muted/50 transition-all duration-300 hover:scale-105"
          >
            {/* Placeholder for brand logos - using text for now */}
            <span className="text-lg md:text-xl font-bold text-muted-foreground group-hover:text-foreground transition-colors">
              {brand.name}
            </span>
          </Link>
        ))}
      </div>
      
      <div className="text-center mt-8">
        <Link 
          href="/products" 
          className="inline-flex items-center text-primary font-medium hover:underline"
        >
          Scopri tutti i brand →
        </Link>
      </div>
    </section>
  );
}
