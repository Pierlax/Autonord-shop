/**
 * Admin Dashboard — Autonord AI Control Plane
 * 
 * Sezioni:
 * 1. Stato Servizi (Shopify, Gemini, Redis, QStash)
 * 2. Statistiche Prodotti (arricchiti, pendenti, tasso)
 * 3. Pipeline Info (versione, flusso)
 * 4. Test Arricchimento (inserisci ID prodotto → lancia worker)
 * 5. Skills Overview (dal gateway)
 * 6. Log Recenti
 */

'use client';

import { useState, useEffect, useCallback } from 'react';

// =============================================================================
// TYPES
// =============================================================================

interface ServiceStatus {
  name: string;
  status: 'connected' | 'error' | 'not_configured';
  latencyMs?: number;
  details?: string;
}

interface ProductStats {
  totalProducts: number;
  enrichedProducts: number;
  pendingProducts: number;
  enrichmentRate: string;
}

interface PipelineInfo {
  version: string;
  flow: string;
  description: string;
}

interface AdminDashboardData {
  timestamp: string;
  services: ServiceStatus[];
  productStats: ProductStats;
  pipeline: PipelineInfo;
}

interface AIMetricsSummary {
  productsEnriched: number;
  timeSavedHours: number;
  costSavingsEstimate: number;
  qualityScore: number;
  errorRate: number;
}

interface AIMetricsReport {
  reportPeriod: string;
  summary: AIMetricsSummary;
  generationMetrics: {
    averageGenerationTimeMs: number;
    averageConfidence: number;
    averageSourcesUsed: number;
    totalConflictsDetected: number;
    totalErrors: number;
    errorsByType: Record<string, number>;
    timeSavedPercent: number;
  };
}

interface TestResult {
  success: boolean;
  product?: {
    id: string;
    title: string;
    vendor: string;
    tags: string[];
    handle: string;
  };
  workerResponse?: Record<string, unknown>;
  message?: string;
  error?: string;
}

// =============================================================================
// AUTH COMPONENT
// =============================================================================

function AuthGate({ children }: { children: (secret: string) => React.ReactNode }) {
  const [secret, setSecret] = useState('');
  const [inputSecret, setInputSecret] = useState('');
  const [authenticated, setAuthenticated] = useState(false);

  // Check if secret is in URL or localStorage
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlSecret = params.get('secret');
    const storedSecret = localStorage.getItem('admin_secret');
    
    if (urlSecret) {
      setSecret(urlSecret);
      localStorage.setItem('admin_secret', urlSecret);
      setAuthenticated(true);
    } else if (storedSecret) {
      setSecret(storedSecret);
      setAuthenticated(true);
    }
  }, []);

  if (authenticated) {
    return <>{children(secret)}</>;
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 max-w-md w-full shadow-2xl">
        <div className="text-center mb-6">
          <div className="text-4xl mb-3">🔐</div>
          <h1 className="text-2xl font-bold text-white">Autonord Admin</h1>
          <p className="text-gray-400 text-sm mt-1">Inserisci la chiave di accesso</p>
        </div>
        <form onSubmit={(e) => {
          e.preventDefault();
          setSecret(inputSecret);
          localStorage.setItem('admin_secret', inputSecret);
          setAuthenticated(true);
        }}>
          <input
            type="password"
            value={inputSecret}
            onChange={(e) => setInputSecret(e.target.value)}
            placeholder="CRON_SECRET o ADMIN_SECRET"
            className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 mb-4"
          />
          <button
            type="submit"
            className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
          >
            Accedi
          </button>
        </form>
      </div>
    </div>
  );
}

// =============================================================================
// SERVICE STATUS CARD
// =============================================================================

function ServiceCard({ service }: { service: ServiceStatus }) {
  const statusConfig = {
    connected: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', dot: 'bg-emerald-500', text: 'text-emerald-400', label: 'Connesso' },
    error: { bg: 'bg-red-500/10', border: 'border-red-500/30', dot: 'bg-red-500', text: 'text-red-400', label: 'Errore' },
    not_configured: { bg: 'bg-yellow-500/10', border: 'border-yellow-500/30', dot: 'bg-yellow-500', text: 'text-yellow-400', label: 'Non configurato' },
  };
  const config = statusConfig[service.status];

  return (
    <div className={`${config.bg} border ${config.border} rounded-xl p-4`}>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-white font-semibold text-sm">{service.name}</h3>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${config.dot} animate-pulse`} />
          <span className={`text-xs font-medium ${config.text}`}>{config.label}</span>
        </div>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-gray-400 text-xs truncate max-w-[200px]">{service.details || '—'}</span>
        {service.latencyMs !== undefined && (
          <span className="text-gray-500 text-xs">{service.latencyMs}ms</span>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// STAT CARD
// =============================================================================

function StatCard({ label, value, sublabel, color }: { label: string; value: string | number; sublabel?: string; color: string }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <div className="text-gray-400 text-xs font-medium uppercase tracking-wider mb-1">{label}</div>
      <div className={`text-3xl font-bold ${color}`}>{value}</div>
      {sublabel && <div className="text-gray-500 text-xs mt-1">{sublabel}</div>}
    </div>
  );
}

// =============================================================================
// AI METRICS PANEL
// =============================================================================

function AIMetricsPanel({ secret }: { secret: string }) {
  const [report, setReport] = useState<AIMetricsReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [noData, setNoData] = useState(false);

  useEffect(() => {
    fetch(`/api/admin/metrics?secret=${secret}`)
      .then(r => r.json())
      .then(data => {
        if (data.success && data.report?.summary?.productsEnriched > 0) {
          setReport(data.report as AIMetricsReport);
        } else {
          setNoData(true);
        }
      })
      .catch(() => setNoData(true))
      .finally(() => setLoading(false));
  }, [secret]);

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
          Metriche AI Pipeline
        </h2>
        {report && (
          <span className="text-gray-600 text-xs">{report.reportPeriod}</span>
        )}
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-gray-500 text-sm py-4">
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Caricamento metriche...
        </div>
      )}

      {!loading && noData && (
        <div className="text-gray-600 text-sm py-4 text-center">
          Nessuna metrica disponibile — i dati appariranno dopo il primo arricchimento con Redis configurato.
        </div>
      )}

      {!loading && report && (
        <>
          {/* KPI row */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
            <div className="bg-gray-950 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-emerald-400">{report.summary.productsEnriched}</div>
              <div className="text-gray-500 text-xs mt-0.5">Arricchiti</div>
            </div>
            <div className="bg-gray-950 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-blue-400">{report.summary.qualityScore}<span className="text-sm font-normal text-gray-500">/100</span></div>
              <div className="text-gray-500 text-xs mt-0.5">Quality Score</div>
            </div>
            <div className="bg-gray-950 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-violet-400">{Math.round(report.generationMetrics.averageConfidence)}<span className="text-sm font-normal text-gray-500">%</span></div>
              <div className="text-gray-500 text-xs mt-0.5">Confidence media</div>
            </div>
            <div className="bg-gray-950 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-amber-400">{report.summary.timeSavedHours}h</div>
              <div className="text-gray-500 text-xs mt-0.5">Tempo risparmiato</div>
            </div>
            <div className="bg-gray-950 rounded-lg p-3 text-center">
              <div className={`text-2xl font-bold ${report.summary.errorRate > 10 ? 'text-red-400' : 'text-gray-300'}`}>
                {report.summary.errorRate}<span className="text-sm font-normal text-gray-500">%</span>
              </div>
              <div className="text-gray-500 text-xs mt-0.5">Error rate</div>
            </div>
          </div>

          {/* Detail row */}
          <div className="grid grid-cols-3 gap-3 text-xs text-gray-500">
            <div>Tempo medio generazione: <span className="text-gray-300">{Math.round(report.generationMetrics.averageGenerationTimeMs / 1000)}s</span></div>
            <div>Fonti medie/prodotto: <span className="text-gray-300">{report.generationMetrics.averageSourcesUsed.toFixed(1)}</span></div>
            <div>Risparmio stimato: <span className="text-emerald-400">€{report.summary.costSavingsEstimate}</span></div>
          </div>

          {/* Errors by type */}
          {report.generationMetrics.totalErrors > 0 && (
            <details className="mt-3">
              <summary className="text-red-400 text-xs cursor-pointer hover:text-red-300">
                {report.generationMetrics.totalErrors} errori negli ultimi 30 giorni
              </summary>
              <div className="mt-2 flex flex-wrap gap-2">
                {Object.entries(report.generationMetrics.errorsByType)
                  .filter(([, count]) => count > 0)
                  .map(([type, count]) => (
                    <span key={type} className="px-2 py-1 bg-red-500/10 border border-red-500/20 rounded text-red-400 text-xs">
                      {type}: {count}
                    </span>
                  ))}
              </div>
            </details>
          )}
        </>
      )}
    </div>
  );
}

// =============================================================================
// TEST ENRICHMENT PANEL
// =============================================================================

function TestEnrichmentPanel({ secret }: { secret: string }) {
  const [productId, setProductId] = useState('');
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);

  const runTest = async () => {
    if (!productId.trim()) return;
    setTesting(true);
    setResult(null);

    try {
      const res = await fetch(`/api/admin/dashboard?secret=${secret}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: productId.trim() }),
      });
      const data = await res.json();
      setResult(data);
    } catch (err) {
      setResult({ success: false, error: err instanceof Error ? err.message : 'Errore sconosciuto' });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
      <h2 className="text-lg font-bold text-white mb-1">🧪 Test Arricchimento</h2>
      <p className="text-gray-400 text-sm mb-4">Inserisci un ID prodotto Shopify per lanciare il worker di arricchimento manualmente.</p>
      
      <div className="flex gap-3 mb-4">
        <input
          type="text"
          value={productId}
          onChange={(e) => setProductId(e.target.value)}
          placeholder="ID prodotto (es. 10139106738518 o gid://shopify/Product/...)"
          className="flex-1 px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          onKeyDown={(e) => e.key === 'Enter' && runTest()}
        />
        <button
          onClick={runTest}
          disabled={testing || !productId.trim()}
          className="px-6 py-2.5 bg-blue-600 text-white rounded-lg font-medium text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
        >
          {testing ? (
            <span className="flex items-center gap-2">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              In corso...
            </span>
          ) : 'Lancia Test'}
        </button>
      </div>

      {result && (
        <div className={`rounded-lg p-4 ${result.success ? 'bg-emerald-500/10 border border-emerald-500/30' : 'bg-red-500/10 border border-red-500/30'}`}>
          {result.success ? (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-emerald-400 font-medium">✓ Arricchimento avviato</span>
              </div>
              {result.product && (
                <div className="text-sm text-gray-300 space-y-1">
                  <div><span className="text-gray-500">Prodotto:</span> {result.product.title}</div>
                  <div><span className="text-gray-500">Vendor:</span> {result.product.vendor}</div>
                  <div><span className="text-gray-500">Tags:</span> {result.product.tags?.join(', ') || 'nessuno'}</div>
                  <div><span className="text-gray-500">Handle:</span> {result.product.handle}</div>
                </div>
              )}
              {result.workerResponse && (
                <details className="mt-3">
                  <summary className="text-gray-400 text-xs cursor-pointer hover:text-gray-300">Risposta worker (JSON)</summary>
                  <pre className="mt-2 text-xs text-gray-400 bg-gray-900 rounded p-3 overflow-x-auto max-h-64 overflow-y-auto">
                    {JSON.stringify(result.workerResponse, null, 2)}
                  </pre>
                </details>
              )}
            </div>
          ) : (
            <div className="text-red-400 text-sm">
              <span className="font-medium">✗ Errore:</span> {result.error || result.message || 'Errore sconosciuto'}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// MAIN DASHBOARD
// =============================================================================

export default function AdminDashboard() {
  const renderDashboard = useCallback((secret: string) => {
    return <DashboardContent secret={secret} />;
  }, []);

  return <AuthGate>{renderDashboard}</AuthGate>;
}

function DashboardContent({ secret }: { secret: string }) {
  const [data, setData] = useState<AdminDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/dashboard?secret=${secret}`);
      if (res.status === 401) {
        localStorage.removeItem('admin_secret');
        window.location.reload();
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
      setError(null);
      setLastRefresh(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore di connessione');
    } finally {
      setLoading(false);
    }
  }, [secret]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, [fetchData]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="flex items-center gap-3 text-gray-400">
          <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Caricamento dashboard...
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-6 max-w-md text-center">
          <div className="text-3xl mb-3">⚠️</div>
          <h2 className="text-red-400 font-bold mb-2">Errore Dashboard</h2>
          <p className="text-red-300 text-sm mb-4">{error}</p>
          <button onClick={fetchData} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm">
            Riprova
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const connectedCount = data.services.filter(s => s.status === 'connected').length;
  const totalServices = data.services.length;

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <header className="bg-gray-900/50 border-b border-gray-800 px-6 py-4 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              ⚡ Autonord AI Control Plane
            </h1>
            <p className="text-gray-500 text-xs mt-0.5">
              Pipeline {data.pipeline.version} — {data.pipeline.flow}
            </p>
          </div>
          <div className="flex items-center gap-4">
            {lastRefresh && (
              <span className="text-gray-600 text-xs">
                Aggiornato: {lastRefresh.toLocaleTimeString('it-IT')}
              </span>
            )}
            <button
              onClick={fetchData}
              className="p-2 text-gray-500 hover:text-white rounded-lg hover:bg-gray-800 transition-colors"
              title="Aggiorna"
            >
              ↻
            </button>
            <button
              onClick={() => { localStorage.removeItem('admin_secret'); window.location.reload(); }}
              className="p-2 text-gray-500 hover:text-red-400 rounded-lg hover:bg-gray-800 transition-colors text-xs"
              title="Logout"
            >
              🚪
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {/* Section 1: Service Status */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
              Stato Servizi ({connectedCount}/{totalServices} connessi)
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {data.services.map((service) => (
              <ServiceCard key={service.name} service={service} />
            ))}
          </div>
        </section>

        {/* Section 2: Product Stats */}
        <section>
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
            Statistiche Prodotti
          </h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard 
              label="Totale Prodotti" 
              value={data.productStats.totalProducts} 
              color="text-white" 
            />
            <StatCard 
              label="Arricchiti" 
              value={data.productStats.enrichedProducts} 
              sublabel={`${data.productStats.enrichmentRate} del catalogo`}
              color="text-emerald-400" 
            />
            <StatCard 
              label="In Attesa" 
              value={data.productStats.pendingProducts} 
              sublabel="Da processare con il nuovo pipeline"
              color="text-amber-400" 
            />
            <StatCard 
              label="Tasso Arricchimento" 
              value={data.productStats.enrichmentRate} 
              sublabel="Prodotti con tag TAYA"
              color="text-blue-400" 
            />
          </div>
        </section>

        {/* Section 3: Pipeline Info */}
        <section>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Pipeline Attiva</h2>
            <div className="flex flex-wrap items-center gap-2 mb-3">
              {data.pipeline.flow.split(' → ').map((step, i, arr) => (
                <span key={i} className="flex items-center gap-2">
                  <span className="px-3 py-1.5 bg-blue-500/10 border border-blue-500/30 rounded-lg text-blue-400 text-sm font-medium">
                    {step}
                  </span>
                  {i < arr.length - 1 && <span className="text-gray-600">→</span>}
                </span>
              ))}
            </div>
            <p className="text-gray-500 text-sm">{data.pipeline.description}</p>
          </div>
        </section>

        {/* Section 3b: AI Metrics */}
        <section>
          <AIMetricsPanel secret={secret} />
        </section>

        {/* Section 4: Test Enrichment */}
        <section>
          <TestEnrichmentPanel secret={secret} />
        </section>

        {/* Section 4b: Bulk Sync */}
        <section>
          <BulkSyncPanel secret={secret} pendingProducts={data.productStats.pendingProducts} />
        </section>

        {/* Section 4c: Danea Sync */}
        <section>
          <DaneaSyncPanel secret={secret} />
        </section>

        {/* Section 4d: Blog Researcher */}
        <section>
          <BlogResearcherPanel secret={secret} />
        </section>

        {/* Section 5: Quick Actions */}
        <section>
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
            Azioni Rapide
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <QuickActionButton
              label="Reset Tutti i Prodotti"
              description="Rimuovi tag TAYA per forzare la rigenerazione"
              icon="🔄"
              endpoint="/api/admin/reset-products?all=true"
              method="POST"
              secret={secret}
              confirmMessage="Sei sicuro? Questo rimuoverà i tag da TUTTI i prodotti e forzerà la rigenerazione."
            />
            <QuickActionButton
              label="Avvia Cron Manuale"
              description="Processa i prodotti pendenti ora"
              icon="⚡"
              endpoint="/api/cron/auto-process-products"
              method="GET"
              secret={secret}
            />
            <QuickActionButton
              label="Statistiche Tag"
              description="Vedi tutti i tag di tutti i prodotti"
              icon="🏷️"
              endpoint="/api/debug/all-tags"
              method="GET"
              secret={secret}
            />
          </div>
        </section>
      </main>
    </div>
  );
}

// =============================================================================
// BULK SYNC PANEL
// =============================================================================

interface BatchResult {
  title: string;
  success: boolean;
  error?: string;
}

interface BatchSummary {
  totalProducts: number;
  batchStart: number;
  batchEnd: number;
  processed: number;
  failed: number;
  hasMore: boolean;
  nextStartIndex: number | null;
}

function BulkSyncPanel({ secret, pendingProducts }: { secret: string; pendingProducts: number }) {
  const [batchSize, setBatchSize] = useState(5);
  const [startIndex, setStartIndex] = useState(0);
  const [onlyPending, setOnlyPending] = useState(true);
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<Array<{ ts: string; text: string; ok: boolean }>>([]);
  const [summary, setSummary] = useState<BatchSummary | null>(null);
  const [totalProcessed, setTotalProcessed] = useState(0);
  const [totalFailed, setTotalFailed] = useState(0);

  const addLog = (text: string, ok: boolean) => {
    const ts = new Date().toLocaleTimeString('it-IT');
    setLog(prev => [{ ts, text, ok }, ...prev].slice(0, 50));
  };

  const runBatch = async (idx: number) => {
    try {
      const res = await fetch('/api/cron/process-products-batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${secret}`,
        },
        body: JSON.stringify({ startIndex: idx, batchSize }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        addLog(`Batch ${idx}-${idx + batchSize}: ERRORE — ${data.error || 'sconosciuto'}`, false);
        return null;
      }

      const results: BatchResult[] = data.results || [];
      results.forEach((r: BatchResult) => {
        addLog(`${r.success ? '✓' : '✗'} [${idx + results.indexOf(r) + 1}] ${r.title}${r.error ? ` — ${r.error}` : ''}`, r.success);
      });

      setTotalProcessed(p => p + (data.summary?.processed || 0));
      setTotalFailed(f => f + (data.summary?.failed || 0));
      setSummary(data.summary);
      return data.summary as BatchSummary;
    } catch (err) {
      addLog(`Errore di rete: ${err instanceof Error ? err.message : 'sconosciuto'}`, false);
      return null;
    }
  };

  const startBulk = async () => {
    setRunning(true);
    setLog([]);
    setSummary(null);
    setTotalProcessed(0);
    setTotalFailed(0);

    addLog(`Avvio bulk sync — batchSize=${batchSize}, startIndex=${startIndex}`, true);

    let currentIndex = startIndex;
    let batchNum = 0;

    while (true) {
      batchNum++;
      addLog(`Batch #${batchNum} (prodotti ${currentIndex + 1}–${currentIndex + batchSize})...`, true);
      const result = await runBatch(currentIndex);

      if (!result || !result.hasMore) {
        addLog(result ? `Completato! ${totalProcessed + (result.processed || 0)} processati.` : 'Interrotto per errore.', !!result);
        break;
      }

      currentIndex = result.nextStartIndex!;
      // Pausa 3s tra batch per ridurre il rischio di rate limit
      await new Promise(r => setTimeout(r, 3000));
    }

    setRunning(false);
  };

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold text-white">Bulk Sync Prodotti</h2>
          <p className="text-gray-400 text-sm mt-0.5">
            Processa più prodotti in sequenza. Rate limit gestito automaticamente (5s tra prodotti).
          </p>
        </div>
        {pendingProducts > 0 && (
          <span className="px-3 py-1 bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs rounded-lg font-medium whitespace-nowrap">
            {pendingProducts} da arricchire
          </span>
        )}
      </div>

      {/* Config */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div>
          <label className="block text-gray-500 text-xs mb-1">Prodotti per batch</label>
          <select
            value={batchSize}
            onChange={e => setBatchSize(Number(e.target.value))}
            disabled={running}
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm disabled:opacity-50"
          >
            <option value={3}>3 (test)</option>
            <option value={5}>5 (sicuro)</option>
            <option value={10}>10 (standard)</option>
            <option value={20}>20 (veloce)</option>
          </select>
        </div>
        <div>
          <label className="block text-gray-500 text-xs mb-1">Inizia da indice</label>
          <input
            type="number"
            min={0}
            value={startIndex}
            onChange={e => setStartIndex(Number(e.target.value))}
            disabled={running}
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm disabled:opacity-50"
          />
        </div>
        <div className="flex items-end">
          <button
            onClick={running ? undefined : startBulk}
            disabled={running}
            className={`w-full px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
              running
                ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                : 'bg-emerald-600 hover:bg-emerald-700 text-white'
            }`}
          >
            {running ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                In corso...
              </span>
            ) : 'Avvia Bulk'}
          </button>
        </div>
      </div>

      {/* Progress summary */}
      {(totalProcessed > 0 || totalFailed > 0) && (
        <div className="flex gap-4 mb-3 text-sm">
          <span className="text-emerald-400">✓ {totalProcessed} completati</span>
          {totalFailed > 0 && <span className="text-red-400">✗ {totalFailed} falliti</span>}
          {summary?.hasMore && (
            <span className="text-amber-400">→ prossimo indice: {summary.nextStartIndex}</span>
          )}
        </div>
      )}

      {/* Log */}
      {log.length > 0 && (
        <div className="bg-gray-950 border border-gray-800 rounded-lg p-3 max-h-48 overflow-y-auto">
          {log.map((entry, i) => (
            <div key={i} className="flex gap-2 text-xs py-0.5">
              <span className="text-gray-600 shrink-0">{entry.ts}</span>
              <span className={entry.ok ? 'text-gray-300' : 'text-red-400'}>{entry.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// DANEA SYNC PANEL
// =============================================================================

interface DaneaBatchResponse {
  success: boolean;
  message?: string;
  summary?: {
    total: number;
    totalEligible?: number;
    created: number;
    updated: number;
    failed: number;
    skipped: number;
  };
  hasMore?: boolean;
  nextOffset?: number | null;
  errors?: string[];
  error?: string;
}

interface DaneaSyncTotals {
  created: number;
  updated: number;
  failed: number;
  skipped: number;
  totalEligible: number;
}

function DaneaSyncPanel({ secret }: { secret: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [running, setRunning] = useState(false);
  const [onlyEcommerce, setOnlyEcommerce] = useState(true);
  const [batchSize, setBatchSize] = useState(30);
  const [done, setDone] = useState(false);
  const [totals, setTotals] = useState<DaneaSyncTotals | null>(null);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [allErrors, setAllErrors] = useState<string[]>([]);
  const [fatalError, setFatalError] = useState<string | null>(null);

  const reset = () => {
    setDone(false);
    setTotals(null);
    setProgress(null);
    setAllErrors([]);
    setFatalError(null);
  };

  const handleUpload = async () => {
    if (!file) return;
    setRunning(true);
    reset();

    let offset = 0;
    const acc: DaneaSyncTotals = { created: 0, updated: 0, failed: 0, skipped: 0, totalEligible: 0 };
    const errors: string[] = [];

    try {
      while (true) {
        const formData = new FormData();
        formData.append('file', file);

        const url = `/api/sync/danea?onlyEcommerce=${onlyEcommerce}&offset=${offset}&limit=${batchSize}`;
        const res = await fetch(url, {
          method: 'POST',
          headers: { Authorization: `Bearer ${secret}` },
          body: formData,
        });
        const data = await res.json() as DaneaBatchResponse;

        if (!data.success) {
          setFatalError(data.error || data.message || 'Errore sconosciuto');
          break;
        }

        if (data.summary) {
          acc.created += data.summary.created;
          acc.updated += data.summary.updated;
          acc.failed += data.summary.failed;
          // skipped is constant (non-ecommerce products) — take from first batch
          if (offset === 0) acc.skipped = data.summary.skipped;
          if (data.summary.totalEligible) acc.totalEligible = data.summary.totalEligible;
        }
        if (data.errors) errors.push(...data.errors);

        setTotals({ ...acc });
        setAllErrors([...errors]);
        setProgress({ current: offset + (data.summary?.total ?? 0), total: acc.totalEligible });

        if (!data.hasMore || data.nextOffset == null) break;
        offset = data.nextOffset;

        // Small pause between batches
        await new Promise(r => setTimeout(r, 500));
      }
    } catch (err) {
      setFatalError(err instanceof Error ? err.message : 'Errore di rete');
    } finally {
      setRunning(false);
      setDone(true);
    }
  };

  const pct = progress && progress.total > 0
    ? Math.round((progress.current / progress.total) * 100)
    : 0;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
      <h2 className="text-lg font-bold text-white mb-1">📦 Sincronizzazione Danea</h2>
      <p className="text-gray-400 text-sm mb-4">
        Carica il file esportato da Danea (.xlsx o .csv) per sincronizzare il catalogo prodotti su Shopify.
        Il sync avviene in batch da {batchSize} prodotti per non superare il timeout Vercel.
      </p>

      {/* File picker + button */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <label className="flex-1 flex items-center gap-3 px-4 py-2.5 bg-gray-800 border border-gray-700 border-dashed rounded-lg cursor-pointer hover:border-gray-500 transition-colors group">
          <span className="text-xl">📂</span>
          <span className="text-sm text-gray-400 group-hover:text-gray-300 truncate">
            {file ? file.name : 'Seleziona file .xlsx o .csv...'}
          </span>
          <input
            type="file"
            accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
            className="hidden"
            disabled={running}
            onChange={e => {
              setFile(e.target.files?.[0] ?? null);
              reset();
            }}
          />
        </label>
        <button
          onClick={handleUpload}
          disabled={!file || running}
          className="px-6 py-2.5 bg-blue-600 text-white rounded-lg font-medium text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
        >
          {running ? (
            <span className="flex items-center gap-2">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              In corso...
            </span>
          ) : 'Sincronizza'}
        </button>
      </div>

      {/* Options */}
      <div className="flex flex-wrap items-center gap-4 mb-4">
        <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={onlyEcommerce}
            onChange={e => setOnlyEcommerce(e.target.checked)}
            disabled={running}
            className="w-4 h-4 rounded accent-blue-500"
          />
          Solo prodotti E-commerce
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-400 select-none">
          Batch:
          <select
            value={batchSize}
            onChange={e => setBatchSize(Number(e.target.value))}
            disabled={running}
            className="px-2 py-1 bg-gray-800 border border-gray-700 rounded text-white text-xs"
          >
            <option value={10}>10 (test)</option>
            <option value={30}>30 (standard)</option>
            <option value={50}>50 (veloce)</option>
            <option value={100}>100 (max)</option>
          </select>
        </label>
      </div>

      {/* Progress bar */}
      {(running || done) && progress && progress.total > 0 && (
        <div className="mb-4">
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>{progress.current} / {progress.total} prodotti</span>
            <span>{pct}%</span>
          </div>
          <div className="w-full bg-gray-800 rounded-full h-2">
            <div
              className="bg-blue-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}

      {/* Fatal error */}
      {fatalError && (
        <div className="rounded-lg p-4 bg-red-500/10 border border-red-500/30 mb-3">
          <div className="text-red-400 text-sm"><span className="font-medium">✗ Errore:</span> {fatalError}</div>
        </div>
      )}

      {/* Running totals */}
      {totals && (
        <div className={`rounded-lg p-4 ${done && !fatalError ? 'bg-emerald-500/10 border border-emerald-500/30' : 'bg-gray-800 border border-gray-700'}`}>
          {done && !fatalError && (
            <div className="text-emerald-400 font-medium mb-3">✓ Sincronizzazione completata</div>
          )}
          {running && (
            <div className="text-blue-400 text-sm font-medium mb-3 animate-pulse">Sincronizzazione in corso...</div>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="text-center">
              <div className="text-2xl font-bold text-emerald-400">{totals.created}</div>
              <div className="text-gray-500 text-xs">Creati</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-400">{totals.updated}</div>
              <div className="text-gray-500 text-xs">Aggiornati</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-red-400">{totals.failed}</div>
              <div className="text-gray-500 text-xs">Falliti</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-400">{totals.skipped}</div>
              <div className="text-gray-500 text-xs">Ignorati</div>
            </div>
          </div>
          {allErrors.length > 0 && (
            <details className="mt-3">
              <summary className="text-red-400 text-xs cursor-pointer hover:text-red-300">
                {allErrors.length} errori — clicca per espandere
              </summary>
              <ul className="mt-2 space-y-1 max-h-40 overflow-y-auto">
                {allErrors.map((e, i) => (
                  <li key={i} className="text-red-300 text-xs bg-red-500/5 rounded px-2 py-1">{e}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// BLOG RESEARCHER PANEL
// =============================================================================

const BLOG_CATEGORIES = [
  'Confronti',
  'Prezzi e Costi',
  'Problemi e Soluzioni',
  'Guide Pratiche',
  'Recensioni',
] as const;

interface DraftArticle {
  id: number;
  title: string;
  handle: string;
  createdAt: string;
  tags: string[];
  adminUrl: string;
}

function BlogResearcherPanel({ secret }: { secret: string }) {
  // ── Generate article state ──────────────────────────────────────────────────
  const [genTitle, setGenTitle] = useState('');
  const [genCategory, setGenCategory] = useState<string>(BLOG_CATEGORIES[0]);
  const [genTopic, setGenTopic] = useState('');
  const [genRunning, setGenRunning] = useState(false);
  const [genResult, setGenResult] = useState<{ ok: boolean; message: string } | null>(null);

  // ── Topic research state ────────────────────────────────────────────────────
  const [researchRunning, setResearchRunning] = useState(false);
  const [researchResult, setResearchResult] = useState<{ ok: boolean; message: string } | null>(null);

  // ── Drafts state ────────────────────────────────────────────────────────────
  const [drafts, setDrafts] = useState<DraftArticle[] | null>(null);
  const [draftsLoading, setDraftsLoading] = useState(false);
  const [draftsError, setDraftsError] = useState<string | null>(null);

  const loadDrafts = useCallback(async () => {
    setDraftsLoading(true);
    setDraftsError(null);
    try {
      const res = await fetch(`/api/admin/blog?secret=${secret}`);
      const data = await res.json();
      if (!res.ok || !data.success) {
        setDraftsError(data.error || 'Errore caricamento bozze');
      } else {
        setDrafts(data.drafts);
      }
    } catch (err) {
      setDraftsError(err instanceof Error ? err.message : 'Errore di rete');
    } finally {
      setDraftsLoading(false);
    }
  }, [secret]);

  useEffect(() => {
    loadDrafts();
  }, [loadDrafts]);

  const generateArticle = async () => {
    if (!genTitle.trim() || !genTopic.trim()) return;
    setGenRunning(true);
    setGenResult(null);
    try {
      const res = await fetch('/api/workers/generate-article', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${secret}`,
        },
        body: JSON.stringify({
          id: Date.now(),
          title: genTitle.trim(),
          category: genCategory,
          topic: genTopic.trim(),
          imageQuery: genTitle.trim(),
          blogId: 'news',
        }),
      });
      const data = await res.json();
      if (data.success && data.article) {
        setGenResult({ ok: true, message: `✓ Bozza creata: "${data.article.handle}"` });
        setGenTitle('');
        setGenTopic('');
        loadDrafts();
      } else {
        setGenResult({ ok: false, message: `✗ ${data.error || 'Errore sconosciuto'}` });
      }
    } catch (err) {
      setGenResult({ ok: false, message: `✗ ${err instanceof Error ? err.message : 'Errore di rete'}` });
    } finally {
      setGenRunning(false);
    }
  };

  const startResearch = async () => {
    setResearchRunning(true);
    setResearchResult(null);
    try {
      const res = await fetch(`/api/cron/blog-researcher?secret=${secret}`, {
        headers: { 'Authorization': `Bearer ${secret}` },
      });
      const data = await res.json();
      if (res.ok && data.success !== false) {
        setResearchResult({ ok: true, message: `✓ Ricerca completata — ${data.articlesScheduled ?? 0} articoli in coda` });
        loadDrafts();
      } else {
        setResearchResult({ ok: false, message: `✗ ${data.error || 'Errore sconosciuto'}` });
      }
    } catch (err) {
      setResearchResult({ ok: false, message: `✗ ${err instanceof Error ? err.message : 'Errore di rete'}` });
    } finally {
      setResearchRunning(false);
    }
  };

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-6">
      <div>
        <h2 className="text-lg font-bold text-white">📝 Blog Researcher</h2>
        <p className="text-gray-400 text-sm mt-0.5">
          Genera articoli TAYA singoli o avvia la ricerca automatica dei topic.
        </p>
      </div>

      {/* ── Genera Articolo ── */}
      <div className="border border-gray-800 rounded-lg p-4 space-y-3">
        <h3 className="text-sm font-semibold text-gray-300">Genera Articolo Ora</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <label className="block text-gray-500 text-xs mb-1">Titolo articolo</label>
            <input
              type="text"
              value={genTitle}
              onChange={e => setGenTitle(e.target.value)}
              disabled={genRunning}
              placeholder="es. Milwaukee M18 vs Makita LXT: quale scegliere nel 2025?"
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-600 disabled:opacity-50"
            />
          </div>
          <div>
            <label className="block text-gray-500 text-xs mb-1">Categoria</label>
            <select
              value={genCategory}
              onChange={e => setGenCategory(e.target.value)}
              disabled={genRunning}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm disabled:opacity-50"
            >
              {BLOG_CATEGORIES.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-gray-500 text-xs mb-1">Argomento da trattare</label>
            <input
              type="text"
              value={genTopic}
              onChange={e => setGenTopic(e.target.value)}
              disabled={genRunning}
              placeholder="es. Confronto prestazioni, prezzi e durata batteria"
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-600 disabled:opacity-50"
            />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={generateArticle}
            disabled={genRunning || !genTitle.trim() || !genTopic.trim()}
            className="px-5 py-2 bg-emerald-600 text-white rounded-lg font-medium text-sm hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {genRunning ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Generazione in corso...
              </span>
            ) : 'Genera Articolo'}
          </button>
          {genResult && (
            <span className={`text-sm ${genResult.ok ? 'text-emerald-400' : 'text-red-400'}`}>
              {genResult.message}
            </span>
          )}
        </div>
      </div>

      {/* ── Avvia Ricerca Topic ── */}
      <div className="border border-gray-800 rounded-lg p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-300">Avvia Ricerca Topic</h3>
            <p className="text-gray-500 text-xs mt-0.5">
              Scansiona Reddit + RSS per trovare topic caldi → genera bozze automaticamente (pipeline completa).
            </p>
          </div>
          <button
            onClick={startResearch}
            disabled={researchRunning}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
          >
            {researchRunning ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                In corso...
              </span>
            ) : '🔍 Avvia Ricerca'}
          </button>
        </div>
        {researchResult && (
          <p className={`text-sm mt-3 ${researchResult.ok ? 'text-emerald-400' : 'text-red-400'}`}>
            {researchResult.message}
          </p>
        )}
      </div>

      {/* ── Bozze Recenti ── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-300">Bozze in Attesa di Revisione</h3>
          <button
            onClick={loadDrafts}
            disabled={draftsLoading}
            className="text-xs text-gray-500 hover:text-gray-300 transition-colors disabled:opacity-50"
          >
            {draftsLoading ? 'Caricamento...' : '↻ Aggiorna'}
          </button>
        </div>

        {draftsError && (
          <div className="rounded-lg p-3 bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
            {draftsError}
          </div>
        )}

        {!draftsError && drafts !== null && drafts.length === 0 && (
          <p className="text-gray-600 text-sm text-center py-4">
            Nessuna bozza in attesa. Genera il primo articolo!
          </p>
        )}

        {drafts && drafts.length > 0 && (
          <div className="space-y-2">
            {drafts.map(draft => (
              <div
                key={draft.id}
                className="flex items-center justify-between gap-3 px-3 py-2.5 bg-gray-800 rounded-lg"
              >
                <div className="min-w-0">
                  <p className="text-white text-sm font-medium truncate">{draft.title}</p>
                  <p className="text-gray-500 text-xs mt-0.5">
                    {new Date(draft.createdAt).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' })}
                    {draft.tags.length > 0 && (
                      <span className="ml-2 text-gray-600">{draft.tags.slice(0, 3).join(', ')}</span>
                    )}
                  </p>
                </div>
                <a
                  href={draft.adminUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1 bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs rounded-lg hover:bg-amber-500/20 transition-colors whitespace-nowrap"
                >
                  Pubblica →
                </a>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// QUICK ACTION BUTTON
// =============================================================================

function QuickActionButton({ 
  label, description, icon, endpoint, method, secret, confirmMessage 
}: { 
  label: string; 
  description: string; 
  icon: string; 
  endpoint: string; 
  method: string; 
  secret: string;
  confirmMessage?: string;
}) {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const execute = async () => {
    if (confirmMessage && !window.confirm(confirmMessage)) return;
    setRunning(true);
    setResult(null);

    try {
      const url = endpoint.includes('?') 
        ? `${endpoint}&secret=${secret}` 
        : `${endpoint}?secret=${secret}`;
      
      const res = await fetch(url, { method });
      const data = await res.json();
      setResult(data.success !== false ? '✓ Completato' : `✗ ${data.error || 'Errore'}`);
    } catch (err) {
      setResult(`✗ ${err instanceof Error ? err.message : 'Errore'}`);
    } finally {
      setRunning(false);
    }
  };

  return (
    <button
      onClick={execute}
      disabled={running}
      className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-left hover:border-gray-700 transition-colors disabled:opacity-50 group"
    >
      <div className="flex items-start gap-3">
        <span className="text-2xl">{icon}</span>
        <div className="flex-1 min-w-0">
          <div className="text-white font-medium text-sm group-hover:text-blue-400 transition-colors">{label}</div>
          <div className="text-gray-500 text-xs mt-0.5">{description}</div>
          {running && <div className="text-blue-400 text-xs mt-2 animate-pulse">In esecuzione...</div>}
          {result && <div className={`text-xs mt-2 ${result.startsWith('✓') ? 'text-emerald-400' : 'text-red-400'}`}>{result}</div>}
        </div>
      </div>
    </button>
  );
}
