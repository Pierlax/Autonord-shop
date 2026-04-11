import { Package } from 'lucide-react';

interface Accessory {
  name: string;
  reason?: string;
}

interface ProductAccessoriesProps {
  accessoriesJson: string | null | undefined;
}

export function ProductAccessories({ accessoriesJson }: ProductAccessoriesProps) {
  if (!accessoriesJson) return null;

  let accessories: Accessory[];
  try {
    const parsed = JSON.parse(accessoriesJson);
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    accessories = parsed.filter(
      (a): a is Accessory => a && typeof a.name === 'string' && a.name.trim() !== ''
    );
  } catch {
    return null;
  }

  if (accessories.length === 0) return null;

  return (
    <section className="mt-8">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
          <Package className="w-5 h-5 text-primary" />
        </div>
        <h2 className="text-xl font-bold text-foreground">Accessori Consigliati</h2>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {accessories.map((acc, i) => (
          <div
            key={i}
            className="flex items-start gap-3 p-4 rounded-xl bg-muted/30 border border-border/50"
          >
            <Package className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
            <div>
              <span className="text-sm font-medium text-foreground">{acc.name}</span>
              {acc.reason && (
                <p className="text-xs text-muted-foreground mt-0.5">{acc.reason}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
