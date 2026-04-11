'use client';

import { useState } from 'react';
import { FileText, ChevronDown, ChevronUp } from 'lucide-react';

interface ProductSourcesProps {
  sourcesUsedJson: string | null | undefined;
  trustBadge: string | null | undefined;
}

function parseJsonArray(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    if (Array.isArray(parsed)) return parsed.filter((v): v is string => typeof v === 'string' && v.trim() !== '');
    return [];
  } catch {
    return [];
  }
}

export function ProductSources({ sourcesUsedJson, trustBadge }: ProductSourcesProps) {
  const [isOpen, setIsOpen] = useState(false);
  const sources = parseJsonArray(sourcesUsedJson);

  if (sources.length === 0 && !trustBadge) return null;

  return (
    <section className="mt-8">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-full"
      >
        <FileText className="w-4 h-4" />
        <span>Fonti e trasparenza ({sources.length} {sources.length === 1 ? 'fonte' : 'fonti'})</span>
        {isOpen ? <ChevronUp className="w-4 h-4 ml-auto" /> : <ChevronDown className="w-4 h-4 ml-auto" />}
      </button>

      {isOpen && (
        <div className="mt-3 p-4 rounded-xl bg-muted/20 border border-border/50 text-sm">
          {sources.length > 0 && (
            <ul className="space-y-1 text-muted-foreground">
              {sources.map((source, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-primary/60 mt-0.5">-</span>
                  {source}
                </li>
              ))}
            </ul>
          )}
          {trustBadge && (
            <p className="mt-3 text-xs text-muted-foreground/60 whitespace-pre-line">{trustBadge}</p>
          )}
        </div>
      )}
    </section>
  );
}
