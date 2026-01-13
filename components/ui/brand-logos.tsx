import Link from 'next/link';
import Image from 'next/image';

const brands = [
  { name: 'Milwaukee', logo: '/brands/milwaukee.png', url: '/products?vendor=milwaukee' },
  { name: 'Makita', logo: '/brands/makita.png', url: '/products?vendor=makita' },
  { name: 'Bosch', logo: '/brands/bosch.png', url: '/products?vendor=bosch' },
  { name: 'DeWalt', logo: '/brands/dewalt.png', url: '/products?vendor=dewalt' },
  { name: 'Hilti', logo: '/brands/hilti.png', url: '/products?vendor=hilti' },
  { name: 'Metabo', logo: '/brands/metabo.png', url: '/products?vendor=metabo' },
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
            className="group flex items-center justify-center p-4 md:p-6 rounded-xl bg-white hover:bg-gray-50 transition-all duration-300 hover:scale-105 hover:shadow-lg"
            title={brand.name}
          >
            <div className="relative w-full h-12 md:h-16">
              <Image
                src={brand.logo}
                alt={`${brand.name} logo`}
                fill
                className="object-contain filter grayscale-0 group-hover:grayscale-0 transition-all duration-300"
                sizes="(max-width: 768px) 100px, 150px"
              />
            </div>
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
