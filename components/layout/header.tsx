'use client';

import Link from 'next/link';
import { Search, ShoppingCart, Menu, Phone, Mail, Truck, User } from 'lucide-react';
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
        {/* Logo */}
        <div className="mr-4 hidden md:flex">
          <Link href="/" className="mr-6 flex items-center space-x-2">
            <span className="hidden font-bold sm:inline-block text-xl tracking-tight">
              AUTONORD <span className="text-primary">SERVICE</span>
            </span>
          </Link>
        </div>

        {/* Mobile Menu Button */}
        <button 
          className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground h-9 py-2 w-9 px-0 md:hidden"
          onClick={() => setIsMenuOpen(!isMenuOpen)}
        >
          <Menu className="h-5 w-5" />
          <span className="sr-only">Toggle Menu</span>
        </button>

        {/* Search Bar - Amazon Style */}
        <div className="flex-1 flex items-center justify-center max-w-2xl mx-4">
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
            {/* Badge count placeholder */}
            <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-primary text-[10px] font-bold text-primary-foreground flex items-center justify-center">
              0
            </span>
          </Link>
        </div>
      </div>

      {/* Mobile Menu */}
      {isMenuOpen && (
        <div className="md:hidden border-t border-border p-4 bg-background">
          <nav className="flex flex-col gap-4">
            <Link href="/" className="text-sm font-medium" onClick={() => setIsMenuOpen(false)}>Home</Link>
            <Link href="/products" className="text-sm font-medium" onClick={() => setIsMenuOpen(false)}>Prodotti</Link>
            <Link href="/about" className="text-sm font-medium" onClick={() => setIsMenuOpen(false)}>Chi Siamo</Link>
            <Link href="/contact" className="text-sm font-medium" onClick={() => setIsMenuOpen(false)}>Contatti</Link>
            <Link href="/b2b" className="text-sm font-medium text-primary" onClick={() => setIsMenuOpen(false)}>Area B2B</Link>
          </nav>
        </div>
      )}
    </header>
  );
}
