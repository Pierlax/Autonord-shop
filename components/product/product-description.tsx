'use client';

import { useState, useMemo } from 'react';
import { ChevronDown, ChevronUp, List } from 'lucide-react';
import { sanitize } from '@/lib/sanitize-html';

interface ProductDescriptionProps {
  descriptionHtml: string;
}

interface Section {
  id: string;
  title: string;
  html: string;
  level: number; // 2 or 3
}

/**
 * FIX #3: Enhanced product description with Table of Contents + collapsible sections.
 *
 * Parses the body_html to extract <h2>/<h3> headings, generates anchor links,
 * and wraps each section in a collapsible container (open by default for the
 * first two sections, collapsed for the rest).
 */
export function ProductDescription({ descriptionHtml }: ProductDescriptionProps) {
  const sections = useMemo(() => extractSections(descriptionHtml), [descriptionHtml]);
  const hasToc = sections.length >= 3;

  // First 2 sections open by default, rest collapsed
  const [openSections, setOpenSections] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    sections.slice(0, 2).forEach(s => initial.add(s.id));
    return initial;
  });

  const toggleSection = (id: string) => {
    setOpenSections(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // If fewer than 3 sections, render as a simple block (no ToC, no accordion)
  if (!hasToc) {
    return (
      <article className="prose prose-invert prose-lg max-w-none">
        <div
          dangerouslySetInnerHTML={{ __html: sanitize(descriptionHtml) }}
          className={DESCRIPTION_STYLES}
        />
      </article>
    );
  }

  return (
    <article className="space-y-6">
      {/* Table of Contents */}
      <nav className="rounded-xl border border-border/50 bg-muted/20 p-4">
        <div className="flex items-center gap-2 mb-3 text-sm font-semibold text-foreground">
          <List className="w-4 h-4 text-primary" />
          Contenuti
        </div>
        <ul className="space-y-1.5">
          {sections.map((s) => (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                className={`text-sm hover:text-primary transition-colors ${
                  s.level === 3 ? 'pl-4 text-muted-foreground/70' : 'text-muted-foreground'
                }`}
              >
                {s.title}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      {/* Sections as accordion */}
      {sections.map((s) => {
        const isOpen = openSections.has(s.id);
        return (
          <section key={s.id} id={s.id} className="scroll-mt-24">
            <button
              onClick={() => toggleSection(s.id)}
              className="flex items-center justify-between w-full text-left py-3 border-b border-border/30 group"
            >
              <span className={`font-bold text-foreground group-hover:text-primary transition-colors ${
                s.level === 2 ? 'text-xl' : 'text-lg'
              }`}>
                {s.title}
              </span>
              {isOpen
                ? <ChevronUp className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                : <ChevronDown className="w-5 h-5 text-muted-foreground flex-shrink-0" />
              }
            </button>
            {isOpen && (
              <div
                className={`prose prose-invert prose-lg max-w-none pt-4 ${DESCRIPTION_STYLES}`}
                dangerouslySetInnerHTML={{ __html: sanitize(s.html) }}
              />
            )}
          </section>
        );
      })}
    </article>
  );
}

// ---------------------------------------------------------------------------
// Shared Tailwind class string for description content
// ---------------------------------------------------------------------------

const DESCRIPTION_STYLES = `
  [&_.product-description]:space-y-6
  [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:text-foreground [&_h2]:mt-0 [&_h2]:mb-4
  [&_h3]:text-xl [&_h3]:font-semibold [&_h3]:text-foreground [&_h3]:mt-8 [&_h3]:mb-4
  [&_p]:text-muted-foreground [&_p]:leading-relaxed [&_p]:mb-4
  [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:space-y-2 [&_ul]:mb-6
  [&_li]:text-muted-foreground
  [&_strong]:text-foreground [&_strong]:font-semibold
  [&_cite]:italic [&_cite]:text-muted-foreground/80
  [&_.product-features]:bg-muted/30 [&_.product-features]:rounded-xl [&_.product-features]:p-6 [&_.product-features]:border [&_.product-features]:border-border/50
  [&_.product-features_h3]:text-lg [&_.product-features_h3]:mt-0
  [&_.product-specs]:bg-muted/30 [&_.product-specs]:rounded-xl [&_.product-specs]:p-6 [&_.product-specs]:border [&_.product-specs]:border-border/50
  [&_.product-specs_h3]:text-lg [&_.product-specs_h3]:mt-0
  [&_.product-usecases]:bg-muted/30 [&_.product-usecases]:rounded-xl [&_.product-usecases]:p-6 [&_.product-usecases]:border [&_.product-usecases]:border-border/50
  [&_.product-usecases_h3]:text-lg [&_.product-usecases_h3]:mt-0
  [&_.expert-opinion]:bg-gradient-to-br [&_.expert-opinion]:from-amber-500/10 [&_.expert-opinion]:to-orange-500/10 [&_.expert-opinion]:rounded-xl [&_.expert-opinion]:p-6 [&_.expert-opinion]:border [&_.expert-opinion]:border-amber-500/20 [&_.expert-opinion]:mt-8
  [&_.expert-opinion_h3]:text-lg [&_.expert-opinion_h3]:mt-0 [&_.expert-opinion_h3]:text-amber-400
  [&_.expert-opinion_p]:text-foreground/90
`.trim();

// ---------------------------------------------------------------------------
// Section extraction from HTML
// ---------------------------------------------------------------------------

function extractSections(html: string): Section[] {
  // Match <h2> and <h3> headings to split into sections
  const headingRegex = /<h([23])[^>]*>([\s\S]*?)<\/h[23]>/gi;
  const headings: Array<{ index: number; level: number; title: string }> = [];

  let match: RegExpExecArray | null;
  while ((match = headingRegex.exec(html)) !== null) {
    headings.push({
      index: match.index,
      level: parseInt(match[1], 10),
      title: match[2].replace(/<[^>]+>/g, '').trim(), // Strip inner tags
    });
  }

  if (headings.length < 3) return []; // Not enough headings for a ToC

  const sections: Section[] = [];
  for (let i = 0; i < headings.length; i++) {
    const start = headings[i].index;
    const end = i < headings.length - 1 ? headings[i + 1].index : html.length;
    const sectionHtml = html.slice(start, end);

    // Remove the heading itself from the section body (we render it separately)
    const bodyHtml = sectionHtml.replace(/<h[23][^>]*>[\s\S]*?<\/h[23]>/i, '').trim();

    const id = headings[i].title
      .toLowerCase()
      .replace(/[^a-z0-9àèéìòùü]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 50);

    sections.push({
      id: id || `section-${i}`,
      title: headings[i].title,
      html: bodyHtml,
      level: headings[i].level,
    });
  }

  return sections;
}
