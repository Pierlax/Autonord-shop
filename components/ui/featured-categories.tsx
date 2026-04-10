import Link from 'next/link';

const categories = [
  {
    name: 'Trapani e Avvitatori',
    description: 'A batteria e a filo',
    image: 'https://images.unsplash.com/photo-1504148455328-c376907d081c?q=80&w=600&auto=format&fit=crop',
    url: '/products?category=trapani',
  },
  {
    name: 'Smerigliatrici',
    description: 'Angolari e dritte',
    image: 'https://images.unsplash.com/photo-1572981779307-38b8cabb2407?q=80&w=600&auto=format&fit=crop',
    url: '/products?category=smerigliatrici',
  },
  {
    name: 'Martelli Demolitori',
    description: 'Per ogni applicazione',
    image: 'https://images.unsplash.com/photo-1504307651254-35680f356dfd?q=80&w=600&auto=format&fit=crop',
    url: '/products?category=martelli',
  },
  {
    name: 'Seghe e Troncatrici',
    description: 'Circolari e a nastro',
    image: 'https://images.unsplash.com/photo-1530124566582-a618bc2615dc?q=80&w=600&auto=format&fit=crop',
    url: '/products?category=seghe',
  },
];

export function FeaturedCategories() {
  return (
    <section className="container px-4 md:px-8 py-12">
      <div className="text-center mb-8">
        <h2 className="text-2xl md:text-3xl font-bold tracking-tight font-heading mb-2">CATEGORIE IN EVIDENZA</h2>
        <p className="text-muted-foreground">Trova rapidamente quello che cerchi</p>
      </div>
      
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
        {categories.map((category) => (
          <Link
            key={category.name}
            href={category.url}
            className="group relative aspect-square overflow-hidden rounded-xl"
          >
            {/* Background image */}
            <div 
              className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-110"
              style={{ backgroundImage: `url(${category.image})` }}
            />
            
            {/* Overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
            
            {/* Content */}
            <div className="absolute bottom-0 left-0 right-0 p-4 md:p-6 text-white">
              <h3 className="font-bold text-sm md:text-lg mb-1 group-hover:text-primary transition-colors">
                {category.name}
              </h3>
              <p className="text-xs md:text-sm text-white/70">
                {category.description}
              </p>
              <span className="inline-flex items-center mt-2 text-xs font-medium text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                Scopri di più →
              </span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
