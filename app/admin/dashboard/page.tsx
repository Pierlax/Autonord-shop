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

        {/* Section 4: Test Enrichment */}
        <section>
          <TestEnrichmentPanel secret={secret} />
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
