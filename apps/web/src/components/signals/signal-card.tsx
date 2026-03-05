'use client';

import Link from 'next/link';
import type { SignalSummary } from '../../lib/api';

const SEVERITY_LABELS: Record<number, string> = {
  0: 'NONE', 1: 'MINIMAL', 2: 'LOW', 3: 'MODERATE', 4: 'HIGH', 5: 'CRITICAL',
};

const SEVERITY_CLASSES: Record<number, string> = {
  0: 'badge-minimal',
  1: 'badge-minimal',
  2: 'badge-low',
  3: 'badge-moderate',
  4: 'badge-high',
  5: 'badge-critical',
};

const CONFIDENCE_CLASSES: Record<string, string> = {
  HIGH: 'confidence-high',
  MED: 'confidence-med',
  LOW: 'confidence-low',
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export function SignalCard({ signal }: { signal: SignalSummary }) {
  return (
    <Link href={`/signals/${signal.id}`} className="card block group">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <span className={`badge ${SEVERITY_CLASSES[signal.severity] || 'badge-minimal'}`}>
              {SEVERITY_LABELS[signal.severity] || 'NONE'}
            </span>
            <span className={`text-xs font-mono ${CONFIDENCE_CLASSES[signal.confidenceLabel] || ''}`}>
              {(signal.confidence * 100).toFixed(0)}%
            </span>
          </div>

          <h3 className="text-sm font-semibold text-white group-hover:text-sentinel-400 transition-colors truncate">
            {signal.title}
          </h3>

          <p className="mt-1 text-xs text-dark-400 line-clamp-2">
            {signal.summary}
          </p>
        </div>

        <span className="shrink-0 text-xs text-dark-500 font-mono">
          {timeAgo(signal.createdAt)}
        </span>
      </div>

      {signal.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {signal.tags.slice(0, 4).map((tag) => (
            <span
              key={tag}
              className="rounded bg-dark-800 px-1.5 py-0.5 text-[10px] text-dark-300"
            >
              {tag}
            </span>
          ))}
          {signal.tags.length > 4 && (
            <span className="text-[10px] text-dark-500">+{signal.tags.length - 4}</span>
          )}
        </div>
      )}
    </Link>
  );
}
