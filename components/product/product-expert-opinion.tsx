import { Sparkles } from 'lucide-react';

interface ProductExpertOpinionProps {
  expertOpinion: string | null | undefined;
}

export function ProductExpertOpinion({ expertOpinion }: ProductExpertOpinionProps) {
  if (!expertOpinion || expertOpinion.trim().length === 0) return null;

  return (
    <section className="mt-8">
      <div className="rounded-xl border border-amber-500/20 bg-gradient-to-br from-amber-500/10 to-orange-500/10 p-6">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center flex-shrink-0">
            <Sparkles className="w-5 h-5 text-amber-400" />
          </div>
          <h2 className="text-xl font-bold text-foreground">Parere del Tecnico</h2>
        </div>
        <p className="text-foreground/90 leading-relaxed whitespace-pre-line">{expertOpinion}</p>
      </div>
    </section>
  );
}
