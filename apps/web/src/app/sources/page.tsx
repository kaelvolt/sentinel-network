'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';

const KIND_LABELS: Record<string, string> = {
  rss: 'RSS', web: 'Web', github: 'GitHub', manual: 'Manual',
};

function reliabilityColor(score: number): string {
  if (score >= 0.8) return 'text-emerald-400';
  if (score >= 0.5) return 'text-yellow-400';
  return 'text-red-400';
}

export default function SourcesPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['sources'],
    queryFn: () => api.sources.list(),
    retry: false,
  });

  const sources = data?.data ?? [];

  return (
    <div className="p-6 lg:p-8 max-w-4xl">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Sources</h1>
          <p className="mt-1 text-sm text-dark-400">
            Data sources being monitored for civic intelligence
          </p>
        </div>
      </header>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="card animate-pulse">
              <div className="h-4 w-1/3 rounded bg-dark-700" />
              <div className="mt-2 h-3 w-2/3 rounded bg-dark-700" />
            </div>
          ))}
        </div>
      ) : sources.length > 0 ? (
        <div className="overflow-hidden rounded-xl border border-dark-700">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-dark-700 bg-dark-850">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-dark-400">
                  Name
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-dark-400">
                  Type
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-dark-400">
                  URL
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-dark-400">
                  Reliability
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-700">
              {sources.map((source) => (
                <tr key={source.id} className="hover:bg-dark-800 transition-colors">
                  <td className="px-4 py-3 font-medium text-white">{source.name}</td>
                  <td className="px-4 py-3">
                    <span className="badge bg-dark-700 text-dark-300">
                      {KIND_LABELS[source.kind] || source.kind}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-dark-400 font-mono text-xs truncate max-w-[200px]">
                    {source.baseUrl}
                  </td>
                  <td className={`px-4 py-3 text-right font-mono ${reliabilityColor(source.reliabilityHint)}`}>
                    {(source.reliabilityHint * 100).toFixed(0)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card text-center py-16">
          <div className="text-4xl mb-3 opacity-20">🌐</div>
          <p className="text-dark-400 text-sm font-medium">No sources configured</p>
          <p className="text-dark-500 text-xs mt-1">
            Add RSS feeds, web pages, or other data sources to start monitoring
          </p>
        </div>
      )}
    </div>
  );
}
