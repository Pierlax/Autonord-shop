import { TableProperties } from 'lucide-react';

interface ProductSpecsTableProps {
  specsJson: string | null | undefined;
  productTitle: string;
}

export function ProductSpecsTable({ specsJson, productTitle }: ProductSpecsTableProps) {
  if (!specsJson) return null;

  let specs: Record<string, string>;
  try {
    specs = JSON.parse(specsJson) as Record<string, string>;
  } catch {
    return null;
  }

  const entries = Object.entries(specs).filter(([, v]) => v && String(v).trim() !== '');
  if (entries.length === 0) return null;

  // JSON-LD: ProductModel with additional properties for each spec
  const specSchema = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: productTitle,
    additionalProperty: entries.map(([name, value]) => ({
      '@type': 'PropertyValue',
      name,
      value,
    })),
  };

  return (
    <section className="mt-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(specSchema).replace(/</g, '\\u003c') }}
      />

      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
          <TableProperties className="w-5 h-5 text-primary" />
        </div>
        <h2 className="text-xl font-bold text-foreground">Specifiche Tecniche</h2>
      </div>

      <div className="rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <tbody>
            {entries.map(([key, value], i) => (
              <tr
                key={key}
                className={i % 2 === 0 ? 'bg-muted/20' : 'bg-card'}
              >
                <td className="px-4 py-3 font-medium text-foreground w-2/5 border-r border-border/50">
                  {key}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
