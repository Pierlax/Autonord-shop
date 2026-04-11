import { Check, X } from 'lucide-react';

interface ProductSuitabilityProps {
  suitableForJson: string | null | undefined;
  notSuitableForJson: string | null | undefined;
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

export function ProductSuitability({ suitableForJson, notSuitableForJson }: ProductSuitabilityProps) {
  const suitableFor = parseJsonArray(suitableForJson);
  const notSuitableFor = parseJsonArray(notSuitableForJson);

  if (suitableFor.length === 0 && notSuitableFor.length === 0) return null;

  return (
    <section className="mt-8">
      <h2 className="text-xl font-bold text-foreground mb-4">Per chi è adatto?</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {suitableFor.length > 0 && (
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-5">
            <h3 className="font-semibold text-emerald-400 mb-3 flex items-center gap-2">
              <Check className="w-5 h-5" />
              Ideale per
            </h3>
            <ul className="space-y-2">
              {suitableFor.map((item, i) => (
                <li key={i} className="text-sm text-foreground/80 flex items-start gap-2">
                  <span className="text-emerald-400 mt-0.5 flex-shrink-0">+</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}
        {notSuitableFor.length > 0 && (
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-5">
            <h3 className="font-semibold text-amber-400 mb-3 flex items-center gap-2">
              <X className="w-5 h-5" />
              Non adatto per
            </h3>
            <ul className="space-y-2">
              {notSuitableFor.map((item, i) => (
                <li key={i} className="text-sm text-foreground/80 flex items-start gap-2">
                  <span className="text-amber-400 mt-0.5 flex-shrink-0">-</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
