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
    queryFn: () => api.signals.list(1, 6),
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

  const hasData = signals.length > 0 || latestDigest || (stats && stats.totalSignals > 0);

  return (
    <div className="p-6 lg:p-8">
      {/* Hero Header */}
      <header className="mb-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs font-medium text-emerald-400 uppercase tracking-wider">
                System Operational
              </span>
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-white">
              Sentinel Network
            </h1>
            <p className="mt-1 text-sm text-dark-400 max-w-xl">
              Civic intelligence platform — monitoring information sources, extracting claims,
              clustering signals, and publishing traceable digests.
            </p>
          </div>

          <div className="hidden sm:flex items-center gap-2">
            <button
              onClick={() => api.ingest.run()}
              className="inline-flex items-center gap-2 rounded-lg bg-sentinel-600 px-4 py-2 text-sm font-medium text-white hover:bg-sentinel-500 transition-colors"
            >
              <RefreshIcon className="h-4 w-4" />
              Run Ingest
            </button>
            <a
              href="/sources"
              className="inline-flex items-center gap-2 rounded-lg bg-dark-800 px-4 py-2 text-sm font-medium text-dark-200 hover:bg-dark-700 transition-colors"
            >
              <PlusIcon className="h-4 w-4" />
              Add Source
            </a>
          </div>
        </div>
      </header>

      {/* Stats */}
      <section className="mb-8">
        <StatsGrid stats={stats} />
      </section>

      {/* Main Content */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Signals Column */}
        <section className="lg:col-span-2 space-y-6">
          {/* Recent Signals */}
          <div>
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-dark-400">
                  Recent Signals
                </h2>
                {signals.length > 0 && (
                  <span className="badge bg-dark-800 text-dark-300">
                    {signals.length} new
                  </span>
                )}
              </div>
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
              <div className="card py-12">
                <div className="text-center">
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-dark-800 mb-4">
                    <SignalIcon className="h-6 w-6 text-dark-500" />
                  </div>
                  <p className="text-dark-300 font-medium">No signals detected yet</p>
                  <p className="text-dark-500 text-sm mt-1 max-w-sm mx-auto">
                    Signals appear when the system ingests sources and extracts verifiable claims.
                    Add sources and run ingestion to get started.
                  </p>
                  <div className="mt-4 flex items-center justify-center gap-3">
                    <a
                      href="/sources"
                      className="text-sm text-sentinel-500 hover:text-sentinel-400"
                    >
                      Configure sources &rarr;
                    </a>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Quick Actions Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <QuickActionCard
              href="/sources"
              icon={GlobeIcon}
              label="Sources"
              count={stats?.totalSources}
              description="Manage data sources"
            />
            <QuickActionCard
              href="/analysis"
              icon={ChartIcon}
              label="Analysis"
              description="View metrics & trends"
            />
            <QuickActionCard
              href="/digests"
              icon={DocIcon}
              label="Digests"
              count={stats?.totalDigests}
              description="Published reports"
            />
            <QuickActionCard
              href="/signals"
              icon={BoltIcon}
              label="All Signals"
              count={stats?.totalSignals}
              description="Browse detections"
            />
          </div>
        </section>

        {/* Sidebar Column */}
        <aside className="space-y-6">
          {/* Latest Digest */}
          <div>
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
                <div className="flex items-start justify-between gap-3 mb-2">
                  <h3 className="font-semibold text-white text-sm leading-tight">
                    {latestDigest.title}
                  </h3>
                  {latestDigest.published && (
                    <span className="shrink-0 badge bg-emerald-500/15 text-emerald-400 text-[10px]">
                      Published
                    </span>
                  )}
                </div>
                <p className="text-xs text-dark-400 line-clamp-4">{latestDigest.summary}</p>
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
              <div className="card py-8 text-center">
                <DocIcon className="h-8 w-8 text-dark-600 mx-auto mb-3" />
                <p className="text-dark-400 text-sm">No digests yet</p>
                <p className="text-dark-500 text-xs mt-1">
                  Digests are generated from recent signals
                </p>
              </div>
            )}
          </div>

          {/* System Status */}
          <div>
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-dark-400">
              System Status
            </h2>
            <div className="card space-y-3">
              <StatusRow label="Kael runtime" status="online" />
              <StatusRow label="API" status="online" />
              <StatusRow
                label="Storage"
                status={hasData ? 'online' : 'standby'}
                detail={hasData ? 'Connected' : 'Waiting for data'}
              />
              <StatusRow
                label="Ingestion"
                status={stats?.lastIngestAt ? 'online' : 'standby'}
                detail={
                  stats?.lastIngestAt
                    ? new Date(stats.lastIngestAt).toLocaleTimeString('en-US', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : 'Never run'
                }
              />
            </div>
          </div>

          {/* Activity Mini-Log */}
          <div>
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-dark-400">
              Activity
            </h2>
            <div className="card">
              <div className="space-y-3">
                <ActivityItem
                  time="Now"
                  text="Dashboard loaded"
                  icon={EyeIcon}
                />
                {stats?.lastIngestAt && (
                  <ActivityItem
                    time={new Date(stats.lastIngestAt).toLocaleTimeString('en-US', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                    text="Ingestion completed"
                    icon={CheckIcon}
                  />
                )}
                <ActivityItem
                  time="System"
                  text={`${stats?.totalSignals || 0} signals in database`}
                  icon={DatabaseIcon}
                />
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

// Components
function QuickActionCard({
  href,
  icon: Icon,
  label,
  count,
  description,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  count?: number;
  description: string;
}) {
  return (
    <a
      href={href}
      className="card group flex flex-col items-center text-center py-5 hover:border-sentinel-700/50"
    >
      <Icon className="h-5 w-5 text-dark-400 group-hover:text-sentinel-400 transition-colors mb-2" />
      <span className="text-sm font-medium text-dark-200 group-hover:text-white transition-colors">
        {label}
      </span>
      {count !== undefined && (
        <span className="text-xs font-mono text-dark-500 mt-0.5">{count}</span>
      )}
      <span className="text-[10px] text-dark-500 mt-1">{description}</span>
    </a>
  );
}

function StatusRow({
  label,
  status,
  detail,
}: {
  label: string;
  status: 'online' | 'standby' | 'offline';
  detail?: string;
}) {
  const colors = {
    online: 'bg-emerald-400',
    standby: 'bg-yellow-400',
    offline: 'bg-red-400',
  };

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className={`h-1.5 w-1.5 rounded-full ${colors[status]}`} />
        <span className="text-xs text-dark-300">{label}</span>
      </div>
      <span className="text-xs font-mono text-dark-500">{detail || status}</span>
    </div>
  );
}

function ActivityItem({
  time,
  text,
  icon: Icon,
}: {
  time: string;
  text: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="h-3.5 w-3.5 text-dark-500 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-xs text-dark-300 truncate">{text}</p>
        <p className="text-[10px] text-dark-500">{time}</p>
      </div>
    </div>
  );
}

// Icons
function RefreshIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
    </svg>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  );
}

function SignalIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
    </svg>
  );
}

function GlobeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
    </svg>
  );
}

function ChartIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
    </svg>
  );
}

function DocIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
  );
}

function BoltIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
    </svg>
  );
}

function EyeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  );
}

function DatabaseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
    </svg>
  );
}
