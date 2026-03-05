'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { api } from '../../../lib/api';

const SEVERITY_LABELS: Record<number, string> = {
  0: 'NONE', 1: 'MINIMAL', 2: 'LOW', 3: 'MODERATE', 4: 'HIGH', 5: 'CRITICAL',
};
const SEVERITY_CLASSES: Record<number, string> = {
  0: 'badge-minimal', 1: 'badge-minimal', 2: 'badge-low',
  3: 'badge-moderate', 4: 'badge-high', 5: 'badge-critical',
};
const CONFIDENCE_CLASSES: Record<string, string> = {
  HIGH: 'confidence-high', MED: 'confidence-med', LOW: 'confidence-low',
};

export default function SignalDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const { data, isLoading, error } = useQuery({
    queryKey: ['signal', id],
    queryFn: () => api.signals.get(id),
    enabled: !!id,
  });

  const signal = data?.data;

  if (isLoading) {
    return (
      <div className="p-6 lg:p-8 max-w-3xl animate-pulse">
        <div className="h-6 w-48 rounded bg-dark-700" />
        <div className="mt-4 space-y-3">
          <div className="h-4 w-full rounded bg-dark-700" />
          <div className="h-4 w-3/4 rounded bg-dark-700" />
        </div>
      </div>
    );
  }

  if (error || !signal) {
    return (
      <div className="p-6 lg:p-8 max-w-3xl">
        <Link href="/signals" className="text-xs text-sentinel-500 hover:text-sentinel-400">
          &larr; Back to signals
        </Link>
        <div className="card mt-6 text-center py-12">
          <p className="text-dark-400">Signal not found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-3xl">
      <Link href="/signals" className="text-xs text-sentinel-500 hover:text-sentinel-400">
        &larr; Back to signals
      </Link>

      <div className="mt-6">
        <div className="flex items-center gap-3 mb-2">
          <span className={`badge ${SEVERITY_CLASSES[signal.severity] || 'badge-minimal'}`}>
            {SEVERITY_LABELS[signal.severity] || 'NONE'}
          </span>
          <span className={`text-sm font-mono ${CONFIDENCE_CLASSES[signal.confidenceLabel] || ''}`}>
            {(signal.confidence * 100).toFixed(0)}% confidence
          </span>
        </div>

        <h1 className="text-xl font-bold text-white">{signal.title}</h1>

        <div className="mt-1 flex items-center gap-3 text-xs text-dark-500">
          <time>{new Date(signal.createdAt).toLocaleDateString('en-US', {
            year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
          })}</time>
          <span className="font-mono">ID: {signal.id.slice(0, 8)}</span>
        </div>
      </div>

      <div className="card mt-6">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-dark-400 mb-3">
          Summary
        </h2>
        <p className="text-sm text-dark-200 leading-relaxed">{signal.summary}</p>
      </div>

      {signal.tags.length > 0 && (
        <div className="card mt-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-dark-400 mb-3">
            Tags
          </h2>
          <div className="flex flex-wrap gap-2">
            {signal.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-md bg-dark-800 px-2.5 py-1 text-xs text-dark-300"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="card mt-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-dark-400 mb-3">
          Metadata
        </h2>
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-dark-400">Cluster</dt>
            <dd className="font-mono text-dark-300">{signal.clusterId.slice(0, 12)}...</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-dark-400">Last updated</dt>
            <dd className="text-dark-300">
              {new Date(signal.updatedAt).toLocaleDateString('en-US', {
                month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
              })}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
