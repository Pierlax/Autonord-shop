'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Play, X } from 'lucide-react';

interface VideoGalleryProps {
  productTitle: string;
  brand: string;
}

// Sample video data - in production this would come from a CMS or product data
const getProductVideos = (brand: string, title: string) => {
  const brandVideos: Record<string, { id: string; title: string; thumbnail: string }[]> = {
    'milwaukee': [
      { id: 'dQw4w9WgXcQ', title: 'Milwaukee M18 FUEL - Panoramica Sistema', thumbnail: 'https://img.youtube.com/vi/dQw4w9WgXcQ/maxresdefault.jpg' },
    ],
    'makita': [
      { id: 'dQw4w9WgXcQ', title: 'Makita 40V MAX XGT - Presentazione', thumbnail: 'https://img.youtube.com/vi/dQw4w9WgXcQ/maxresdefault.jpg' },
    ],
    'dewalt': [
      { id: 'dQw4w9WgXcQ', title: 'DeWalt 20V MAX - Sistema Cordless', thumbnail: 'https://img.youtube.com/vi/dQw4w9WgXcQ/maxresdefault.jpg' },
    ],
  };

  const normalizedBrand = brand.toLowerCase();
  return brandVideos[normalizedBrand] || [];
};

export function VideoGallery({ productTitle, brand }: VideoGalleryProps) {
  const [activeVideo, setActiveVideo] = useState<string | null>(null);
  const [triggerRef, setTriggerRef] = useState<HTMLButtonElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const videos = getProductVideos(brand, productTitle);

  const closeModal = useCallback(() => {
    setActiveVideo(null);
    // Restore focus to the trigger button that opened the modal
    triggerRef?.focus();
  }, [triggerRef]);

  // Escape key handler + focus trap
  useEffect(() => {
    if (!activeVideo) return;

    // Move focus into the modal
    closeButtonRef.current?.focus();

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        closeModal();
        return;
      }
      // Basic focus trap: keep Tab inside the dialog
      if (e.key !== 'Tab' || !dialogRef.current) return;
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey ? document.activeElement === first : document.activeElement === last) {
        e.preventDefault();
        (e.shiftKey ? last : first)?.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [activeVideo, closeModal]);

  if (videos.length === 0) {
    return null;
  }

  return (
    <>
      {/* Video Section */}
      <div className="mt-8 border-t border-border pt-8">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Play className="h-5 w-5 text-primary" aria-hidden="true" />
          Video Prodotto
        </h3>
        <div className="grid gap-4 sm:grid-cols-2">
          {videos.map((video) => (
            <button
              key={video.id}
              aria-label={`Riproduci video: ${video.title}`}
              onClick={(e) => {
                setTriggerRef(e.currentTarget);
                setActiveVideo(video.id);
              }}
              className="group relative aspect-video rounded-lg overflow-hidden bg-zinc-900 hover:ring-2 hover:ring-primary transition-all"
            >
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent z-10" />
              <div className="absolute inset-0 flex items-center justify-center z-20">
                <div className="w-16 h-16 rounded-full bg-primary/90 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Play className="h-8 w-8 text-white ml-1" fill="white" aria-hidden="true" />
                </div>
              </div>
              <div className="absolute bottom-0 left-0 right-0 p-4 z-20">
                <p className="text-white text-sm font-medium">{video.title}</p>
              </div>
              <div className="absolute inset-0 bg-zinc-800 flex items-center justify-center">
                <Play className="h-12 w-12 text-zinc-600" aria-hidden="true" />
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Video Modal */}
      {activeVideo && (
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label="Video prodotto"
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={closeModal}
        >
          <button
            ref={closeButtonRef}
            aria-label="Chiudi video"
            className="absolute top-4 right-4 text-white hover:text-primary transition-colors focus:outline-none focus:ring-2 focus:ring-primary rounded"
            onClick={closeModal}
          >
            <X className="h-8 w-8" aria-hidden="true" />
          </button>
          <div
            className="w-full max-w-4xl aspect-video"
            onClick={(e) => e.stopPropagation()}
          >
            <iframe
              src={`https://www.youtube.com/embed/${activeVideo}?autoplay=1`}
              title="Video prodotto"
              loading="lazy"
              className="w-full h-full rounded-lg"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        </div>
      )}
    </>
  );
}
