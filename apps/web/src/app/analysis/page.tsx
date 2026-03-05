'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';

export default function AnalysisPage() {
  const signalsQuery = useQuery({
    queryKey: ['signals', 'all'],
    queryFn: () => api.signals.list(1, 100),
    retry: false,
  });

  const signals = signalsQuery.data?.data ?? [];

  const severityCounts = [0, 0, 0, 0, 0, 0];
  const confidenceBuckets = { LOW: 0, MED: 0, HIGH: 0 };
  const tagFreq: Record<string, number> = {};

  for (const s of signals) {
    severityCounts[s.severity] = (severityCounts[s.severity] || 0) + 1;
    confidenceBuckets[s.confidenceLabel] = (confidenceBuckets[s.confidenceLabel] || 0) + 1;
    for (const t of s.tags) {
      tagFreq[t] = (tagFreq[t] || 0) + 1;
    }
  }

  const topTags = Object.entries(tagFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12);

  const sevLabels = ['None', 'Minimal', 'Low', 'Moderate', 'High', 'Critical'];
  const sevColors = ['bg-slate-600', 'bg-slate-500', 'bg-blue-500', 'bg-yellow-500', 'bg-orange-500', 'bg-red-500'];
  const maxSev = Math.max(...severityCounts, 1);

  return (
    <div className="p-6 lg:p-8 max-w-5xl">
      <header className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-white">Analysis</h1>
        <p className="mt-1 text-sm text-dark-400">
          Signal distribution and intelligence metrics
        </p>
      </header>

      {signals.length === 0 ? (
        <div className="card text-center py-16">
          <div className="text-4xl mb-3 opacity-20">📊</div>
          <p className="text-dark-400 text-sm font-medium">No data to analyze yet</p>
          <p className="text-dark-500 text-xs mt-1">
            Analysis will populate once signals are generated
          </p>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="card">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-dark-400 mb-4">
              Severity Distribution
            </h2>
            <div className="space-y-2.5">
              {severityCounts.map((count, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="w-16 text-xs text-dark-400">{sevLabels[i]}</span>
                  <div className="flex-1 h-5 rounded bg-dark-800 overflow-hidden">
                    <div
                      className={`h-full rounded ${sevColors[i]} transition-all duration-500`}
                      style={{ width: `${(count / maxSev) * 100}%` }}
                    />
                  </div>
                  <span className="w-8 text-right text-xs font-mono text-dark-300">{count}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-dark-400 mb-4">
              Confidence Breakdown
            </h2>
            <div className="flex items-end justify-center gap-8 h-40">
              {(['LOW', 'MED', 'HIGH'] as const).map((label) => {
                const count = confidenceBuckets[label];
                const maxConf = Math.max(...Object.values(confidenceBuckets), 1);
                const height = (count / maxConf) * 100;
                const colors = { LOW: 'bg-red-500', MED: 'bg-yellow-500', HIGH: 'bg-emerald-500' };
                return (
                  <div key={label} className="flex flex-col items-center gap-2">
                    <span className="text-xs font-mono text-dark-300">{count}</span>
                    <div className="w-12 rounded-t bg-dark-800 relative" style={{ height: '120px' }}>
                      <div
                        className={`absolute bottom-0 w-full rounded-t ${colors[label]} transition-all duration-500`}
                        style={{ height: `${height}%` }}
                      />
                    </div>
                    <span className="text-xs text-dark-400">{label}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="card lg:col-span-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-dark-400 mb-4">
              Top Tags
            </h2>
            {topTags.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {topTags.map(([tag, count]) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-dark-800 px-3 py-1.5 text-xs"
                  >
                    <span className="text-dark-200">{tag}</span>
                    <span className="font-mono text-dark-500">{count}</span>
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-dark-500">No tags found in current signals</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
