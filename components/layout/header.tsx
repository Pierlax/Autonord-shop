'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Search, ShoppingCart, Menu, Phone, Truck, User, BookOpen, ChevronDown, Package, FileText } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

export function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<{ type: 'product' | 'article'; title: string; url: string }[]>([]);
  const searchRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Update suggestions as user types
  useEffect(() => {
    if (searchQuery.length < 2) {
      setSuggestions([]);
      return;
    }

    const query = searchQuery.toLowerCase();
    
    // Product search suggestions based on common keywords
    const productKeywords = ['milwaukee', 'makita', 'dewalt', 'bosch', 'avvitatore', 'trapano', 'smerigliatrice', 'batteria', 'tassellatore', 'hilti'];
    const productSuggestions = productKeywords
      .filter(keyword => keyword.includes(query))
      .slice(0, 3)
      .map(keyword => ({
        type: 'product' as const,
        title: `Cerca "${keyword}" nei prodotti`,
        url: `/products?q=${keyword}`
      }));

    // Article search suggestions based on common topics
    const articleKeywords = ['confronto', 'guida', 'prezzi', 'problemi', 'recensione', 'migliori'];
    const articleSuggestions = articleKeywords
      .filter(keyword => keyword.includes(query))
      .slice(0, 2)
      .map(keyword => ({
        type: 'article' as const,
        title: `Cerca "${keyword}" nelle guide`,
        url: `/blog?q=${keyword}`
      }));

    setSuggestions([...productSuggestions, ...articleSuggestions]);
  }, [searchQuery]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      setShowSuggestions(false);
      router.push(`/search?q=${encodeURIComponent(searchQuery)}`);
    }
  };

  const handleSuggestionClick = (url: string) => {
    setShowSuggestions(false);
    setSearchQuery('');
    router.push(url);
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

        {/* Unified Search Bar */}
        <div className="flex-1 flex items-center justify-center max-w-2xl mx-4 hidden md:flex" ref={searchRef}>
          <form onSubmit={handleSearch} className="w-full relative">
            <div className="relative w-full">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <input
                type="search"
                placeholder="Cerca prodotti e guide..."
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 pl-9 pr-12"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => setShowSuggestions(true)}
              />
              <button 
                type="submit"
                className="absolute right-1 top-1 h-8 px-3 bg-primary text-primary-foreground rounded-sm text-xs font-medium hover:bg-primary/90 transition-colors"
              >
                CERCA
              </button>
            </div>

            {/* Search Suggestions Dropdown */}
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-background border border-border rounded-md shadow-lg z-50 overflow-hidden">
                {suggestions.map((suggestion, index) => (
                  <button
                    key={index}
                    type="button"
                    className="w-full px-4 py-3 text-left hover:bg-accent flex items-center gap-3 border-b border-border last:border-0"
                    onClick={() => handleSuggestionClick(suggestion.url)}
                  >
                    {suggestion.type === 'article' ? (
                      <FileText className="h-4 w-4 text-primary flex-shrink-0" />
                    ) : (
                      <Package className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    )}
                    <span className="text-sm truncate">{suggestion.title}</span>
                    {suggestion.type === 'article' && (
                      <span className="ml-auto text-xs text-primary bg-primary/10 px-2 py-0.5 rounded">Guida</span>
                    )}
                  </button>
                ))}
                <button
                  type="submit"
                  className="w-full px-4 py-3 text-left hover:bg-accent flex items-center gap-3 bg-muted/50"
                >
                  <Search className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">Cerca "{searchQuery}" in tutto il sito</span>
                </button>
              </div>
            )}
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
            <Link 
              href="/blog/milwaukee-vs-makita-vs-dewalt-confronto-definitivo-per-professionisti-2026" 
              className="px-3 py-3 text-xs text-primary hover:underline"
            >
              Milwaukee vs Makita →
            </Link>
            <Link 
              href="/blog/quanto-costa-davvero-attrezzare-un-furgone-da-elettricista-guida-ai-prezzi-2026" 
              className="px-3 py-3 text-xs text-primary hover:underline"
            >
              Guida Prezzi 2026 →
            </Link>
          </nav>
        </div>
      </div>

      {/* Mobile Menu */}
      {isMenuOpen && (
        <div className="md:hidden border-t border-border bg-background">
          <div className="container px-4 py-4 space-y-4">
            {/* Mobile Search */}
            <form onSubmit={handleSearch} className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <input
                type="search"
                placeholder="Cerca prodotti e guide..."
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 pl-9"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </form>
            
            <nav className="flex flex-col space-y-2">
              <Link href="/products" className="px-3 py-2 text-sm font-medium hover:bg-accent rounded-md" onClick={() => setIsMenuOpen(false)}>
                Prodotti
              </Link>
              <Link href="/blog" className="px-3 py-2 text-sm font-medium bg-primary/10 text-primary rounded-md flex items-center gap-2" onClick={() => setIsMenuOpen(false)}>
                <BookOpen className="h-4 w-4" />
                Guide e Confronti
              </Link>
              <Link href="/services" className="px-3 py-2 text-sm font-medium hover:bg-accent rounded-md" onClick={() => setIsMenuOpen(false)}>
                Noleggio & Assistenza
              </Link>
              <Link href="/about" className="px-3 py-2 text-sm font-medium hover:bg-accent rounded-md" onClick={() => setIsMenuOpen(false)}>
                Chi Siamo
              </Link>
              <Link href="/contact" className="px-3 py-2 text-sm font-medium hover:bg-accent rounded-md" onClick={() => setIsMenuOpen(false)}>
                Contatti
              </Link>
              <Link href="/account" className="px-3 py-2 text-sm font-medium hover:bg-accent rounded-md flex items-center gap-2" onClick={() => setIsMenuOpen(false)}>
                <User className="h-4 w-4" />
                Accedi
              </Link>
            </nav>
          </div>
        </div>
      )}
    </header>
  );
}
