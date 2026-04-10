'use client';

import { Zap, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';

interface TLDRBoxProps {
  content: string;
}

/**
 * GAP 8: TL;DR Box for Blog Articles
 * Extracts and displays the TL;DR section at the top of articles
 * Following Krug's principle: users scan, they don't read
 */
export function TLDRBox({ content }: TLDRBoxProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  
  // Extract TL;DR from content (looks for **TL;DR:** pattern)
  const tldrMatch = content.match(/\*\*TL;DR:?\*\*\s*([^#\n]+(?:\n(?!#)[^\n]+)*)/i);
  
  if (!tldrMatch) {
    return null;
  }
  
  const tldrText = tldrMatch[1].trim();
  
  // Parse bullet points if present
  const lines = tldrText.split('\n').filter(line => line.trim());
  const hasBullets = lines.some(line => line.trim().startsWith('-'));
  
  return (
    <div className="mb-8 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border border-amber-500/20 rounded-xl overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-amber-500/5 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center">
            <Zap className="h-4 w-4 text-amber-400" />
          </div>
          <div className="text-left">
            <span className="font-bold text-amber-400">TL;DR</span>
            <span className="text-zinc-400 text-sm ml-2">— Leggi in 10 secondi</span>
          </div>
        </div>
        {isExpanded ? (
          <ChevronUp className="h-5 w-5 text-zinc-400" />
        ) : (
          <ChevronDown className="h-5 w-5 text-zinc-400" />
        )}
      </button>
      
      {/* Content */}
      {isExpanded && (
        <div className="px-5 pb-5">
          {hasBullets ? (
            <ul className="space-y-2">
              {lines.map((line, i) => {
                const text = line.replace(/^-\s*/, '').trim();
                if (!text) return null;
                
                // Parse bold text
                const parts = text.split(/\*\*(.*?)\*\*/g);
                
                return (
                  <li key={i} className="flex items-start gap-2 text-amber-100/90">
                    <span className="text-amber-400 mt-1">•</span>
                    <span>
                      {parts.map((part, j) => 
                        j % 2 === 1 ? (
                          <strong key={j} className="text-amber-300 font-semibold">{part}</strong>
                        ) : (
                          part
                        )
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-amber-100/90 leading-relaxed">
              {tldrText.split(/\*\*(.*?)\*\*/g).map((part, i) => 
                i % 2 === 1 ? (
                  <strong key={i} className="text-amber-300 font-semibold">{part}</strong>
                ) : (
                  part
                )
              )}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Utility function to check if content has TL;DR
 */
export function hasTLDR(content: string): boolean {
  return /\*\*TL;DR:?\*\*/i.test(content);
}
