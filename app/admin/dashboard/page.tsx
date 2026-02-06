/**
 * Admin Dashboard — AI Control Plane
 * 
 * Visual interface for monitoring and controlling all AI skills.
 * Provides real-time visibility into skill health, execution logs,
 * and manual trigger capabilities.
 */

'use client';

import { useState, useEffect, useCallback } from 'react';

// =============================================================================
// TYPES
// =============================================================================

interface SkillMetadata {
  name: string;
  description: string;
  version: string;
  author: string;
  tags: string[];
  triggers: string[];
  maxDurationSeconds: number;
}

interface SkillHealth {
  state: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
  lastExecutedAt?: string;
  lastResult?: string;
  totalExecutions: number;
  totalErrors: number;
  averageDurationMs: number;
}

interface ExecutionLog {
  executionId: string;
  skillName: string;
  context: {
    executionId: string;
    triggeredBy: string;
    requestedAt: string;
    productId?: string;
  };
  result: {
    success: boolean;
    status: string;
    message: string;
    durationMs: number;
    error?: string;
  };
  startedAt: string;
  completedAt: string;
}

interface LogEntry {
  timestamp: string;
  level: string;
  service: string;
  message: string;
  data?: Record<string, unknown>;
}

interface DashboardData {
  skills: SkillMetadata[];
  health: Record<string, SkillHealth>;
  executionStats: {
    total: number;
    bySkill: Record<string, { total: number; success: number; failed: number }>;
    recentErrors: ExecutionLog[];
  };
  recentExecutions: ExecutionLog[];
  recentLogs: LogEntry[];
  logStats: {
    totalEntries: number;
    byLevel: Record<string, number>;
    byService: Record<string, number>;
  };
}

// =============================================================================
// COMPONENTS
// =============================================================================

function HealthBadge({ state }: { state: string }) {
  const colors: Record<string, string> = {
    healthy: 'bg-green-100 text-green-800 border-green-200',
    degraded: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    unhealthy: 'bg-red-100 text-red-800 border-red-200',
    unknown: 'bg-gray-100 text-gray-800 border-gray-200',
  };
  const icons: Record<string, string> = {
    healthy: '●',
    degraded: '◐',
    unhealthy: '○',
    unknown: '?',
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${colors[state] || colors.unknown}`}>
      {icons[state] || '?'} {state}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    success: 'bg-green-100 text-green-700',
    partial: 'bg-yellow-100 text-yellow-700',
    failed: 'bg-red-100 text-red-700',
    skipped: 'bg-gray-100 text-gray-700',
  };
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${colors[status] || 'bg-gray-100 text-gray-700'}`}>
      {status}
    </span>
  );
}

function SkillCard({
  skill,
  health,
  stats,
  onTrigger,
}: {
  skill: SkillMetadata;
  health?: SkillHealth;
  stats?: { total: number; success: number; failed: number };
  onTrigger: (name: string) => void;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">{skill.name}</h3>
          <p className="text-sm text-gray-500">v{skill.version}</p>
        </div>
        <HealthBadge state={health?.state || 'unknown'} />
      </div>
      <p className="text-sm text-gray-600 mb-4 line-clamp-2">{skill.description}</p>
      <div className="flex flex-wrap gap-1 mb-4">
        {skill.tags.map((tag) => (
          <span key={tag} className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs">
            {tag}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2 text-center mb-4">
        <div className="bg-gray-50 rounded p-2">
          <div className="text-lg font-bold text-gray-900">{stats?.total || 0}</div>
          <div className="text-xs text-gray-500">Runs</div>
        </div>
        <div className="bg-green-50 rounded p-2">
          <div className="text-lg font-bold text-green-700">{stats?.success || 0}</div>
          <div className="text-xs text-gray-500">Success</div>
        </div>
        <div className="bg-red-50 rounded p-2">
          <div className="text-lg font-bold text-red-700">{stats?.failed || 0}</div>
          <div className="text-xs text-gray-500">Failed</div>
        </div>
      </div>
      <div className="flex items-center justify-between">
        <div className="text-xs text-gray-400">
          {health?.lastExecutedAt
            ? `Last: ${new Date(health.lastExecutedAt).toLocaleString('it-IT')}`
            : 'Never executed'}
        </div>
        <button
          onClick={() => onTrigger(skill.name)}
          className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          Trigger
        </button>
      </div>
    </div>
  );
}

function ExecutionTable({ executions }: { executions: ExecutionLog[] }) {
  if (executions.length === 0) {
    return <p className="text-gray-500 text-sm py-4 text-center">No executions yet</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200">
            <th className="text-left py-2 px-3 font-medium text-gray-600">Skill</th>
            <th className="text-left py-2 px-3 font-medium text-gray-600">Status</th>
            <th className="text-left py-2 px-3 font-medium text-gray-600">Trigger</th>
            <th className="text-left py-2 px-3 font-medium text-gray-600">Duration</th>
            <th className="text-left py-2 px-3 font-medium text-gray-600">Time</th>
            <th className="text-left py-2 px-3 font-medium text-gray-600">Message</th>
          </tr>
        </thead>
        <tbody>
          {executions.map((exec) => (
            <tr key={exec.executionId} className="border-b border-gray-100 hover:bg-gray-50">
              <td className="py-2 px-3 font-medium">{exec.skillName}</td>
              <td className="py-2 px-3"><StatusBadge status={exec.result.status} /></td>
              <td className="py-2 px-3 text-gray-500">{exec.context.triggeredBy}</td>
              <td className="py-2 px-3 text-gray-500">{(exec.result.durationMs / 1000).toFixed(1)}s</td>
              <td className="py-2 px-3 text-gray-400 text-xs">{new Date(exec.startedAt).toLocaleString('it-IT')}</td>
              <td className="py-2 px-3 text-gray-600 truncate max-w-xs">{exec.result.message}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LogViewer({ logs }: { logs: LogEntry[] }) {
  const levelColors: Record<string, string> = {
    debug: 'text-cyan-600',
    info: 'text-green-600',
    warn: 'text-yellow-600',
    error: 'text-red-600',
  };

  if (logs.length === 0) {
    return <p className="text-gray-500 text-sm py-4 text-center">No logs yet</p>;
  }

  return (
    <div className="bg-gray-900 rounded-lg p-4 overflow-x-auto max-h-96 overflow-y-auto font-mono text-xs">
      {logs.map((entry, i) => (
        <div key={i} className="flex gap-2 py-0.5 hover:bg-gray-800 px-1 rounded">
          <span className="text-gray-500 shrink-0">
            {new Date(entry.timestamp).toLocaleTimeString('it-IT')}
          </span>
          <span className={`shrink-0 font-bold ${levelColors[entry.level] || 'text-gray-400'}`}>
            [{entry.level.toUpperCase()}]
          </span>
          <span className="text-blue-400 shrink-0">[{entry.service}]</span>
          <span className="text-gray-300">{entry.message}</span>
        </div>
      ))}
    </div>
  );
}

// =============================================================================
// TRIGGER MODAL
// =============================================================================

function TriggerModal({
  skillName,
  onClose,
  onSubmit,
}: {
  skillName: string;
  onClose: () => void;
  onSubmit: (skillName: string, payload: string, isAsync: boolean) => void;
}) {
  const [payload, setPayload] = useState('{}');
  const [isAsync, setIsAsync] = useState(true);

  const defaultPayloads: Record<string, string> = {
    'product-enrichment': JSON.stringify({
      productId: '',
      title: '',
      vendor: '',
      productType: '',
      sku: null,
      barcode: null,
      tags: [],
    }, null, 2),
    'blog-research': JSON.stringify({
      action: 'discover-topics',
    }, null, 2),
    'content-validation': JSON.stringify({
      description: '',
      pros: [],
      cons: [],
      faqs: [],
    }, null, 2),
    'image-search': JSON.stringify({
      title: '',
      vendor: '',
      sku: null,
      barcode: null,
    }, null, 2),
  };

  useEffect(() => {
    if (defaultPayloads[skillName]) {
      setPayload(defaultPayloads[skillName]);
    }
  }, [skillName]);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6">
        <h3 className="text-lg font-bold mb-4">Trigger: {skillName}</h3>
        <label className="block text-sm font-medium text-gray-700 mb-1">Payload (JSON)</label>
        <textarea
          value={payload}
          onChange={(e) => setPayload(e.target.value)}
          className="w-full h-48 font-mono text-sm border border-gray-300 rounded-lg p-3 mb-4 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
        <div className="flex items-center gap-2 mb-4">
          <input
            type="checkbox"
            id="async"
            checked={isAsync}
            onChange={(e) => setIsAsync(e.target.checked)}
            className="rounded"
          />
          <label htmlFor="async" className="text-sm text-gray-600">
            Execute asynchronously (via QStash)
          </label>
        </div>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={() => onSubmit(skillName, payload, isAsync)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
          >
            Execute
          </button>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// MAIN PAGE
// =============================================================================

export default function AdminDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [triggerSkillName, setTriggerSkillName] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'skills' | 'executions' | 'logs'>('skills');

  const fetchDashboard = useCallback(async () => {
    try {
      const res = await fetch('/api/gateway/dashboard', {
        headers: {
          Authorization: `Bearer ${process.env.NEXT_PUBLIC_CRON_SECRET || 'dev'}`,
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
    const interval = setInterval(fetchDashboard, 10000); // Refresh every 10s
    return () => clearInterval(interval);
  }, [fetchDashboard]);

  const handleTrigger = async (skillName: string, payload: string, isAsync: boolean) => {
    try {
      const parsedPayload = JSON.parse(payload);
      const res = await fetch('/api/gateway/dashboard', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.NEXT_PUBLIC_CRON_SECRET || 'dev'}`,
        },
        body: JSON.stringify({ skillName, payload: parsedPayload, async: isAsync }),
      });
      const result = await res.json();
      alert(result.success !== false ? `Skill triggered successfully!` : `Error: ${result.error || result.message}`);
      setTriggerSkillName(null);
      fetchDashboard();
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500">Loading dashboard...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md">
          <h2 className="text-red-800 font-bold mb-2">Dashboard Error</h2>
          <p className="text-red-600 text-sm">{error}</p>
          <button onClick={fetchDashboard} className="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700">
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Autonord AI Control Plane</h1>
            <p className="text-sm text-gray-500">Skill management and monitoring dashboard</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-sm font-medium text-gray-700">{data.skills.length} Skills</div>
              <div className="text-xs text-gray-400">{data.executionStats.total} Total Executions</div>
            </div>
            <button
              onClick={fetchDashboard}
              className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
              title="Refresh"
            >
              ↻
            </button>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="max-w-7xl mx-auto px-6 pt-6">
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit mb-6">
          {(['skills', 'executions', 'logs'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                activeTab === tab ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab === 'skills' ? 'Skills' : tab === 'executions' ? 'Executions' : 'Logs'}
            </button>
          ))}
        </div>

        {/* Skills Tab */}
        {activeTab === 'skills' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {data.skills.map((skill) => (
              <SkillCard
                key={skill.name}
                skill={skill}
                health={data.health[skill.name]}
                stats={data.executionStats.bySkill[skill.name]}
                onTrigger={setTriggerSkillName}
              />
            ))}
          </div>
        )}

        {/* Executions Tab */}
        {activeTab === 'executions' && (
          <div className="bg-white border border-gray-200 rounded-lg">
            <div className="px-5 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold">Recent Executions</h2>
            </div>
            <ExecutionTable executions={data.recentExecutions} />
          </div>
        )}

        {/* Logs Tab */}
        {activeTab === 'logs' && (
          <div>
            <div className="flex gap-4 mb-4">
              <div className="bg-white border border-gray-200 rounded-lg p-4 flex-1">
                <div className="text-2xl font-bold">{data.logStats.totalEntries}</div>
                <div className="text-sm text-gray-500">Total Log Entries</div>
              </div>
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="text-2xl font-bold text-red-700">{data.logStats.byLevel.error || 0}</div>
                <div className="text-sm text-red-500">Errors</div>
              </div>
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <div className="text-2xl font-bold text-yellow-700">{data.logStats.byLevel.warn || 0}</div>
                <div className="text-sm text-yellow-500">Warnings</div>
              </div>
            </div>
            <LogViewer logs={data.recentLogs} />
          </div>
        )}
      </div>

      {/* Trigger Modal */}
      {triggerSkillName && (
        <TriggerModal
          skillName={triggerSkillName}
          onClose={() => setTriggerSkillName(null)}
          onSubmit={handleTrigger}
        />
      )}
    </div>
  );
}
