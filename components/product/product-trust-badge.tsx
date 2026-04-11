import { Shield } from 'lucide-react';

interface ProductTrustBadgeProps {
  confidence: string | null | undefined;
  sourcesUsedJson: string | null | undefined;
  generatedAt: string | null | undefined;
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

export function ProductTrustBadge({ confidence, sourcesUsedJson, generatedAt }: ProductTrustBadgeProps) {
  const confidenceNum = confidence ? parseInt(confidence, 10) : null;
  const sources = parseJsonArray(sourcesUsedJson);

  if (confidenceNum === null && sources.length === 0) return null;

  // Format date
  let dateStr = '';
  if (generatedAt) {
    try {
      dateStr = new Date(generatedAt).toLocaleDateString('it-IT', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
    } catch { /* ignore */ }
  }

  return (
    <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
      <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
        <Shield className="w-3.5 h-3.5" />
        <span className="font-medium">Scheda verificata</span>
        {sources.length > 0 && (
          <span>- {sources.length} {sources.length === 1 ? 'fonte' : 'fonti'}</span>
        )}
        {confidenceNum !== null && (
          <span>- Affidabilità {confidenceNum}%</span>
        )}
      </div>
      {dateStr && (
        <span className="text-muted-foreground/60">Aggiornata il {dateStr}</span>
      )}
    </div>
  );
}
