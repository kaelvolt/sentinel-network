'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';

export default function DigestsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['digests'],
    queryFn: () => api.digests.list(),
    retry: false,
  });

  const digests = data?.data ?? [];

  return (
    <div className="p-6 lg:p-8 max-w-4xl">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-white">Digests</h1>
        <p className="mt-1 text-sm text-dark-400">
          Periodic summaries of civic intelligence signals
        </p>
      </header>

      {isLoading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="card animate-pulse">
              <div className="h-5 w-1/2 rounded bg-dark-700" />
              <div className="mt-3 space-y-2">
                <div className="h-3 w-full rounded bg-dark-700" />
                <div className="h-3 w-4/5 rounded bg-dark-700" />
              </div>
            </div>
          ))}
        </div>
      ) : digests.length > 0 ? (
        <div className="space-y-4">
          {digests.map((digest) => (
            <article key={digest.id} className="card">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {digest.published ? (
                      <span className="badge bg-emerald-500/15 text-emerald-400">Published</span>
                    ) : (
                      <span className="badge bg-yellow-500/15 text-yellow-400">Draft</span>
                    )}
                    <span className="text-xs text-dark-500 font-mono">
                      {digest.signalCount} signal{digest.signalCount !== 1 ? 's' : ''}
                    </span>
                  </div>

                  <h2 className="text-base font-semibold text-white">{digest.title}</h2>
                  <p className="mt-1.5 text-sm text-dark-400 line-clamp-3">{digest.summary}</p>
                </div>

                <div className="shrink-0 text-right">
                  <p className="text-xs text-dark-500">
                    {new Date(digest.periodStart).toLocaleDateString('en-US', {
                      month: 'short', day: 'numeric',
                    })}
                    {' — '}
                    {new Date(digest.periodEnd).toLocaleDateString('en-US', {
                      month: 'short', day: 'numeric',
                    })}
                  </p>
                  {digest.publishedAt && (
                    <p className="mt-1 text-[10px] text-dark-600">
                      Published {new Date(digest.publishedAt).toLocaleDateString()}
                    </p>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="card text-center py-16">
          <div className="text-4xl mb-3 opacity-20">📋</div>
          <p className="text-dark-400 text-sm font-medium">No digests yet</p>
          <p className="text-dark-500 text-xs mt-1">
            Digests are generated periodically from analyzed signals
          </p>
        </div>
      )}
    </div>
  );
}
