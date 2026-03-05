'use client';

import type { DashboardStats } from '../../lib/api';

interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  accent?: 'default' | 'success' | 'warning' | 'danger';
}

const ACCENT_COLORS = {
  default: 'text-white',
  success: 'text-emerald-400',
  warning: 'text-yellow-400',
  danger: 'text-red-400',
};

function StatCard({ label, value, sub, accent = 'default' }: StatCardProps) {
  return (
    <div className="card">
      <p className={`stat-value ${ACCENT_COLORS[accent]}`}>{value}</p>
      <p className="stat-label">{label}</p>
      {sub && <p className="mt-0.5 text-xs text-dark-500">{sub}</p>}
    </div>
  );
}

export function StatsGrid({ stats }: { stats: DashboardStats | null }) {
  if (!stats) {
    return (
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="card animate-pulse">
            <div className="h-8 w-16 rounded bg-dark-700" />
            <div className="mt-2 h-4 w-24 rounded bg-dark-700" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <StatCard
        label="Active Signals"
        value={stats.activeSignals}
      />
      <StatCard
        label="Critical"
        value={stats.criticalSignals}
        accent={stats.criticalSignals > 0 ? 'danger' : 'default'}
      />
      <StatCard
        label="Sources"
        value={stats.totalSources}
        accent="success"
      />
      <StatCard
        label="Digests Published"
        value={stats.totalDigests}
      />
    </div>
  );
}
