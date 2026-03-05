'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../../lib/api';
import { SignalCard } from '../../components/signals/signal-card';

export default function SignalsPage() {
  const [page, setPage] = useState(1);
  const limit = 20;

  const { data, isLoading } = useQuery({
    queryKey: ['signals', page],
    queryFn: () => api.signals.list(page, limit),
    retry: false,
  });

  const signals = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / limit);

  return (
    <div className="p-6 lg:p-8 max-w-4xl">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-white">Signals</h1>
        <p className="mt-1 text-sm text-dark-400">
          {total > 0
            ? `${total} signal${total !== 1 ? 's' : ''} detected`
            : 'Monitoring for civic intelligence signals'}
        </p>
      </header>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="card animate-pulse">
              <div className="h-4 w-3/4 rounded bg-dark-700" />
              <div className="mt-2 h-3 w-1/2 rounded bg-dark-700" />
            </div>
          ))}
        </div>
      ) : signals.length > 0 ? (
        <>
          <div className="space-y-3">
            {signals.map((s) => (
              <SignalCard key={s.id} signal={s} />
            ))}
          </div>

          {totalPages > 1 && (
            <div className="mt-6 flex items-center justify-center gap-3">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="nav-link disabled:opacity-30"
              >
                Previous
              </button>
              <span className="text-xs font-mono text-dark-400">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="nav-link disabled:opacity-30"
              >
                Next
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="card text-center py-16">
          <div className="text-4xl mb-3 opacity-20">⚡</div>
          <p className="text-dark-400 text-sm font-medium">No signals yet</p>
          <p className="text-dark-500 text-xs mt-1 max-w-sm mx-auto">
            Once sources are ingested and analyzed, civic intelligence signals will appear here
          </p>
        </div>
      )}
    </div>
  );
}
