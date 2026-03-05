'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { StatsGrid } from '../components/dashboard/stats-grid';
import { SignalCard } from '../components/signals/signal-card';

export default function DashboardPage() {
  const statsQuery = useQuery({
    queryKey: ['dashboard', 'stats'],
    queryFn: () => api.dashboard.stats(),
    retry: false,
  });

  const signalsQuery = useQuery({
    queryKey: ['signals', 'recent'],
    queryFn: () => api.signals.list(1, 8),
    retry: false,
  });

  const digestQuery = useQuery({
    queryKey: ['digests', 'latest'],
    queryFn: () => api.digests.latest(),
    retry: false,
  });

  const stats = statsQuery.data?.data ?? null;
  const signals = signalsQuery.data?.data ?? [];
  const latestDigest = digestQuery.data?.data ?? null;

  return (
    <div className="p-6 lg:p-8 max-w-6xl">
      <header className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-white">Dashboard</h1>
        <p className="mt-1 text-sm text-dark-400">
          Civic intelligence overview — real-time monitoring and analysis
        </p>
      </header>

      <section className="mb-8">
        <StatsGrid stats={stats} />
      </section>

      <div className="grid gap-8 lg:grid-cols-3">
        <section className="lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-dark-400">
              Recent Signals
            </h2>
            <a href="/signals" className="text-xs text-sentinel-500 hover:text-sentinel-400">
              View all &rarr;
            </a>
          </div>

          {signalsQuery.isLoading ? (
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="card animate-pulse">
                  <div className="h-4 w-3/4 rounded bg-dark-700" />
                  <div className="mt-2 h-3 w-1/2 rounded bg-dark-700" />
                </div>
              ))}
            </div>
          ) : signals.length > 0 ? (
            <div className="space-y-3">
              {signals.map((signal) => (
                <SignalCard key={signal.id} signal={signal} />
              ))}
            </div>
          ) : (
            <div className="card text-center py-12">
              <p className="text-dark-400 text-sm">No signals yet</p>
              <p className="text-dark-500 text-xs mt-1">
                Signals will appear here once ingestion and analysis are running
              </p>
            </div>
          )}
        </section>

        <aside>
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-dark-400">
            Latest Digest
          </h2>

          {digestQuery.isLoading ? (
            <div className="card animate-pulse">
              <div className="h-5 w-2/3 rounded bg-dark-700" />
              <div className="mt-3 space-y-2">
                <div className="h-3 w-full rounded bg-dark-700" />
                <div className="h-3 w-5/6 rounded bg-dark-700" />
              </div>
            </div>
          ) : latestDigest ? (
            <div className="card">
              <h3 className="font-semibold text-white text-sm">{latestDigest.title}</h3>
              <p className="mt-2 text-xs text-dark-400 line-clamp-4">{latestDigest.summary}</p>
              <div className="mt-3 flex items-center justify-between text-xs text-dark-500">
                <span>{latestDigest.signalCount} signals covered</span>
                <span>
                  {new Date(latestDigest.createdAt).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                  })}
                </span>
              </div>
              <a
                href="/digests"
                className="mt-3 block text-center rounded-lg bg-dark-800 py-2 text-xs text-sentinel-400 hover:bg-dark-700 transition-colors"
              >
                Read full digest
              </a>
            </div>
          ) : (
            <div className="card text-center py-8">
              <p className="text-dark-500 text-xs">No digests published yet</p>
            </div>
          )}

          <div className="mt-6">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-dark-400">
              System
            </h2>
            <div className="card space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-dark-400">Kael status</span>
                <span className="flex items-center gap-1.5 text-xs text-emerald-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  Online
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-dark-400">Last ingest</span>
                <span className="text-xs text-dark-300 font-mono">
                  {stats?.lastIngestAt
                    ? new Date(stats.lastIngestAt).toLocaleTimeString('en-US', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : '—'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-dark-400">Total signals</span>
                <span className="text-xs text-dark-300 font-mono">
                  {stats?.totalSignals ?? '—'}
                </span>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
