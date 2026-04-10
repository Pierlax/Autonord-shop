import { ThumbsUp, ThumbsDown } from 'lucide-react';

interface ProductProsConsProps {
  prosJson: string | null | undefined;
  consJson: string | null | undefined;
}

export function ProductProsCons({ prosJson, consJson }: ProductProsConsProps) {
  const pros = parseJsonArray(prosJson);
  const cons = parseJsonArray(consJson);

  if (pros.length === 0 && cons.length === 0) return null;

  return (
    <section className="mt-8">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Pros */}
        {pros.length > 0 && (
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-full bg-emerald-500/15 flex items-center justify-center flex-shrink-0">
                <ThumbsUp className="w-4 h-4 text-emerald-400" />
              </div>
              <h3 className="font-bold text-emerald-400">Perché sceglierlo</h3>
            </div>
            <ul className="space-y-2.5">
              {pros.map((pro, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-foreground/90">
                  <span className="mt-1 w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
                  {pro}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Cons */}
        {cons.length > 0 && (
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-full bg-amber-500/15 flex items-center justify-center flex-shrink-0">
                <ThumbsDown className="w-4 h-4 text-amber-400" />
              </div>
              <h3 className="font-bold text-amber-400">Da considerare</h3>
            </div>
            <ul className="space-y-2.5">
              {cons.map((con, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-foreground/90">
                  <span className="mt-1 w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0" />
                  {con}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
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
