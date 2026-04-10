'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const banners = [
  {
    id: 1,
    title: 'Novità Milwaukee',
    subtitle: 'Scopri la nuova gamma M18 FUEL',
    description: 'Potenza e autonomia senza precedenti per i professionisti più esigenti',
    cta: 'Scopri le Novità',
    url: '/products?vendor=milwaukee',
    bgColor: 'from-red-900 to-red-700',
    image: 'https://images.unsplash.com/photo-1504148455328-c376907d081c?q=80&w=800&auto=format&fit=crop',
  },
  {
    id: 2,
    title: 'Offerte Speciali',
    subtitle: 'Fino al -30% su articoli selezionati',
    description: 'Approfitta delle promozioni su trapani, smerigliatrici e molto altro',
    cta: 'Vai alle Offerte',
    url: '/products',
    bgColor: 'from-primary to-blue-600',
    image: 'https://images.unsplash.com/photo-1581094794329-cd1361dca687?q=80&w=800&auto=format&fit=crop',
  },
  {
    id: 3,
    title: 'Noleggio Attrezzature',
    subtitle: 'Soluzioni flessibili per ogni cantiere',
    description: 'Noleggia le migliori attrezzature professionali a breve e lungo termine',
    cta: 'Richiedi Preventivo',
    url: '/services',
    bgColor: 'from-slate-800 to-slate-600',
    image: 'https://images.unsplash.com/photo-1504307651254-35680f356dfd?q=80&w=800&auto=format&fit=crop',
  },
];

export function PromoBanners() {
  const [currentSlide, setCurrentSlide] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % banners.length);
    }, 6000);
    return () => clearInterval(timer);
  }, []);

  const nextSlide = () => {
    setCurrentSlide((prev) => (prev + 1) % banners.length);
  };

  const prevSlide = () => {
    setCurrentSlide((prev) => (prev - 1 + banners.length) % banners.length);
  };

  return (
    <section className="container px-4 md:px-8 py-8">
      <div className="relative overflow-hidden rounded-2xl">
        {/* Slides */}
        <div 
          className="flex transition-transform duration-500 ease-out"
          style={{ transform: `translateX(-${currentSlide * 100}%)` }}
        >
          {banners.map((banner) => (
            <div
              key={banner.id}
              className={`relative min-w-full h-[300px] md:h-[400px] bg-gradient-to-r ${banner.bgColor} flex items-center`}
            >
              {/* Background image */}
              <div 
                className="absolute inset-0 bg-cover bg-center opacity-30 mix-blend-overlay"
                style={{ backgroundImage: `url(${banner.image})` }}
              />
              
              {/* Content */}
              <div className="relative z-10 container px-8 md:px-16">
                <div className="max-w-xl text-white">
                  <span className="inline-block px-3 py-1 mb-4 text-xs font-semibold uppercase tracking-wider bg-white/20 rounded-full backdrop-blur-sm">
                    {banner.subtitle}
                  </span>
                  <h2 className="text-3xl md:text-5xl font-bold mb-4 font-heading">
                    {banner.title}
                  </h2>
                  <p className="text-white/80 mb-6 text-sm md:text-base">
                    {banner.description}
                  </p>
                  <Link
                    href={banner.url}
                    className="inline-flex h-11 items-center justify-center rounded-lg bg-white px-6 text-sm font-semibold text-slate-900 shadow hover:bg-white/90 transition-colors"
                  >
                    {banner.cta}
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Navigation arrows */}
        <button
          onClick={prevSlide}
          className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-white hover:bg-white/30 transition-colors"
          aria-label="Slide precedente"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
        <button
          onClick={nextSlide}
          className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-white hover:bg-white/30 transition-colors"
          aria-label="Slide successiva"
        >
          <ChevronRight className="h-6 w-6" />
        </button>

        {/* Dots */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
          {banners.map((_, index) => (
            <button
              key={index}
              onClick={() => setCurrentSlide(index)}
              className={`w-2 h-2 rounded-full transition-all ${
                index === currentSlide 
                  ? 'w-8 bg-white' 
                  : 'bg-white/50 hover:bg-white/70'
              }`}
              aria-label={`Vai alla slide ${index + 1}`}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
