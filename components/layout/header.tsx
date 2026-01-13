'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Search, ShoppingCart, Menu, Phone, Truck, User, BookOpen, ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const router = useRouter();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/products?q=${encodeURIComponent(searchQuery)}`);
    }
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      {/* Top Bar B2B */}
      <div className="hidden md:flex w-full bg-secondary text-secondary-foreground py-1 px-4 text-xs justify-between items-center">
        <div className="flex gap-4">
          <span className="flex items-center gap-1"><Truck className="h-3 w-3" /> Spedizione Gratuita da 300€</span>
          <span className="flex items-center gap-1"><Phone className="h-3 w-3" /> Assistenza Tecnica: 010 7456076</span>
        </div>
        <div className="flex gap-4">
          <Link href="/b2b" className="hover:underline font-medium text-primary">Area Rivenditori</Link>
          <Link href="/contact" className="hover:underline">Contatti</Link>
        </div>
      </div>

      <div className="container flex h-16 max-w-screen-2xl items-center justify-between px-4 md:px-8">
        {/* Logo - Official Image */}
        <div className="mr-4 hidden md:flex">
          <Link href="/" className="mr-6 flex items-center">
            <Image 
              src="/autonord-logo.png" 
              alt="Autonord Service" 
              width={180} 
              height={60}
              className="h-12 w-auto"
              priority
            />
          </Link>
        </div>

        {/* Mobile Logo */}
        <Link href="/" className="md:hidden flex items-center">
          <Image 
            src="/autonord-logo.png" 
            alt="Autonord Service" 
            width={140} 
            height={46}
            className="h-10 w-auto"
            priority
          />
        </Link>

        {/* Mobile Menu Button */}
        <button 
          className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground h-9 py-2 w-9 px-0 md:hidden"
          onClick={() => setIsMenuOpen(!isMenuOpen)}
        >
          <Menu className="h-5 w-5" />
          <span className="sr-only">Toggle Menu</span>
        </button>

        {/* Search Bar - Amazon Style */}
        <div className="flex-1 flex items-center justify-center max-w-2xl mx-4 hidden md:flex">
          <form onSubmit={handleSearch} className="w-full relative flex items-center">
            <div className="relative w-full">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <input
                type="search"
                placeholder="Cerca per codice, nome o categoria..."
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 pl-9 pr-12"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <button 
                type="submit"
                className="absolute right-1 top-1 h-8 px-3 bg-primary text-primary-foreground rounded-sm text-xs font-medium hover:bg-primary/90 transition-colors"
              >
                CERCA
              </button>
            </div>
          </form>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-2 md:gap-4">
          <Link href="/account" className="hidden md:flex items-center gap-2 text-sm font-medium hover:text-primary transition-colors">
            <User className="h-5 w-5" />
            <span className="hidden lg:inline-block">Accedi</span>
          </Link>
          
          <Link href="/cart" className="relative inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground h-9 py-2 w-9 px-0">
            <ShoppingCart className="h-5 w-5" />
            <span className="sr-only">Carrello</span>
            <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-primary text-[10px] font-bold text-primary-foreground flex items-center justify-center">
              0
            </span>
          </Link>
        </div>
      </div>

      {/* PRIMARY NAVIGATION BAR - TAYA Style */}
      <div className="hidden md:block w-full bg-zinc-900 border-t border-zinc-800">
        <div className="container max-w-screen-2xl px-4 md:px-8">
          <nav className="flex items-center gap-1">
            {/* Prodotti */}
            <Link 
              href="/products" 
              className="flex items-center gap-2 px-4 py-3 text-sm font-semibold text-white hover:bg-zinc-800 transition-colors"
            >
              PRODOTTI
            </Link>
            
            {/* GUIDE E CONFRONTI - Elevated Blog Link */}
            <Link 
              href="/blog" 
              className="flex items-center gap-2 px-4 py-3 text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <BookOpen className="h-4 w-4" />
              GUIDE E CONFRONTI
              <span className="ml-1 px-1.5 py-0.5 text-[10px] bg-white/20 rounded">NUOVO</span>
            </Link>
            
            {/* Brand */}
            <div className="relative group">
              <button className="flex items-center gap-1 px-4 py-3 text-sm font-medium text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors">
                BRAND
                <ChevronDown className="h-3 w-3" />
              </button>
              <div className="absolute top-full left-0 hidden group-hover:block bg-zinc-900 border border-zinc-800 rounded-b-md shadow-lg min-w-[200px] z-50">
                <Link href="/products?vendor=Milwaukee" className="block px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-primary">Milwaukee</Link>
                <Link href="/products?vendor=Makita" className="block px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-primary">Makita</Link>
                <Link href="/products?vendor=DeWalt" className="block px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-primary">DeWalt</Link>
                <Link href="/products?vendor=Bosch" className="block px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-primary">Bosch</Link>
                <Link href="/products?vendor=Hilti" className="block px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-primary">Hilti</Link>
              </div>
            </div>
            
            {/* Servizi */}
            <Link 
              href="/services" 
              className="flex items-center gap-2 px-4 py-3 text-sm font-medium text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors"
            >
              NOLEGGIO & ASSISTENZA
            </Link>
            
            {/* Chi Siamo */}
            <Link 
              href="/about" 
              className="flex items-center gap-2 px-4 py-3 text-sm font-medium text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors"
            >
              CHI SIAMO
            </Link>
            
            {/* Spacer */}
            <div className="flex-1" />
            
            {/* Quick Links to Popular Articles */}
            <div className="flex items-center gap-4 text-xs text-zinc-400">
              <Link href="/blog/milwaukee-vs-makita-vs-dewalt-confronto-definitivo-2026" className="hover:text-primary transition-colors">
                Milwaukee vs Makita →
              </Link>
              <Link href="/blog/quanto-costa-attrezzare-furgone-elettricista-2026" className="hover:text-primary transition-colors">
                Guida Prezzi 2026 →
              </Link>
            </div>
          </nav>
        </div>
      </div>

      {/* Mobile Menu */}
      {isMenuOpen && (
        <div className="md:hidden border-t border-border p-4 bg-background">
          {/* Mobile Search */}
          <form onSubmit={handleSearch} className="mb-4">
            <div className="relative w-full">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <input
                type="search"
                placeholder="Cerca prodotti..."
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm pl-9"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </form>
          
          <nav className="flex flex-col gap-4">
            <Link href="/" className="text-sm font-medium" onClick={() => setIsMenuOpen(false)}>Home</Link>
            <Link href="/products" className="text-sm font-medium" onClick={() => setIsMenuOpen(false)}>Prodotti</Link>
            
            {/* GUIDE E CONFRONTI - Mobile */}
            <Link 
              href="/blog" 
              className="text-sm font-bold text-primary flex items-center gap-2" 
              onClick={() => setIsMenuOpen(false)}
            >
              <BookOpen className="h-4 w-4" />
              GUIDE E CONFRONTI
              <span className="px-1.5 py-0.5 text-[10px] bg-primary/20 rounded">NUOVO</span>
            </Link>
            
            <Link href="/services" className="text-sm font-medium" onClick={() => setIsMenuOpen(false)}>Noleggio & Assistenza</Link>
            <Link href="/about" className="text-sm font-medium" onClick={() => setIsMenuOpen(false)}>Chi Siamo</Link>
            <Link href="/contact" className="text-sm font-medium" onClick={() => setIsMenuOpen(false)}>Contatti</Link>
            
            <div className="border-t border-border pt-4 mt-2">
              <p className="text-xs text-muted-foreground mb-2">Articoli Popolari:</p>
              <Link href="/blog/milwaukee-vs-makita-vs-dewalt-confronto-definitivo-2026" className="text-xs text-primary block mb-1" onClick={() => setIsMenuOpen(false)}>
                → Milwaukee vs Makita vs DeWalt
              </Link>
              <Link href="/blog/quanto-costa-attrezzare-furgone-elettricista-2026" className="text-xs text-primary block" onClick={() => setIsMenuOpen(false)}>
                → Guida Prezzi Elettricista 2026
              </Link>
            </div>
            
            <Link href="/b2b" className="text-sm font-medium text-primary border-t border-border pt-4" onClick={() => setIsMenuOpen(false)}>Area B2B</Link>
          </nav>
        </div>
      )}
    </header>
  );
}
