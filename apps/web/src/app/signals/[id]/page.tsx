import { notFound } from 'next/navigation';
import Link from 'next/link';
import { fetchSignal, fetchCluster } from '@/lib/api';
import { ReasoningTrail } from '@/components/ReasoningTrail';

interface SignalPageProps {
  params: {
    id: string;
  };
}

function getSeverityClass(severity: number): string {
  const classes: Record<number, string> = {
    0: 'severity-none',
    1: 'severity-minimal',
    2: 'severity-low',
    3: 'severity-moderate',
    4: 'severity-high',
    5: 'severity-critical',
  };
  return classes[severity] || classes[0];
}

function getSeverityLabel(severity: number): string {
  const labels: Record<number, string> = {
    0: 'None',
    1: 'Minimal',
    2: 'Low',
    3: 'Moderate',
    4: 'High',
    5: 'Critical',
  };
  return labels[severity] || 'None';
}

function getConfidenceClass(label: string): string {
  const classes: Record<string, string> = {
    LOW: 'border-gray-300 text-gray-600',
    MED: 'border-black text-black',
    HIGH: 'border-black bg-black text-white',
  };
  return classes[label] || classes.LOW;
}

function getAttentionLabel(attention: string): string | null {
  const labels: Record<string, string> = {
    urgent: '👁️ Watch Urgent',
    watch: '👁️ Watch',
  };
  return labels[attention] || null;
}

export default async function SignalPage({ params }: SignalPageProps) {
  try {
    const response = await fetchSignal(params.id);
    
    if (!response.ok) {
      notFound();
    }
    
    const signal = response.data;

    return (
      <main className="max-w-3xl mx-auto px-4 py-8">
        {/* Back link */}
        <Link 
          href="/" 
          className="text-sm text-gray-500 hover:text-black transition-colors mb-6 inline-block"
        >
          ← Back to Signals
        </Link>

        {/* Header */}
        <header className="mb-8 pb-6 border-b border-gray-200">
          <div className="flex items-start gap-3 mb-4">
            <h1 className="text-2xl font-medium leading-tight flex-1">
              {signal.title}
            </h1>
            <span className={`px-2 py-1 text-xs font-medium rounded-sm whitespace-nowrap ${getSeverityClass(signal.severity)}`}> 
              {getSeverityLabel(signal.severity)}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className={`px-2 py-0.5 text-xs border rounded-sm ${getConfidenceClass(signal.confidenceLabel)}`}> 
              {signal.confidenceLabel} ({Math.round(signal.confidence * 100)}%)
            </span>
            {signal.tags.map((tag) => (
              <span key={tag} className="text-xs text-gray-500">
                #{tag}
              </span>
            ))}
            {getAttentionLabel(signal.attention) && (
              <span className="text-xs bg-yellow-50 text-yellow-700 px-2 py-0.5 rounded-sm">
                {getAttentionLabel(signal.attention)}
              </span>
            )}
          </div>

          <div className="mt-4 text-xs text-gray-400">
            Signal ID: {signal.id.slice(0, 8)}... • Created:{' '}
            {new Date(signal.createdAt).toLocaleString()}
          </div>
        </header>

        {/* Summary */}
        <section className="mb-8">
          <h2 className="text-sm font-medium uppercase tracking-wide text-gray-500 mb-3">
            Summary
          </h2>
          <div className="prose prose-sm max-w-none">
            <p className="text-gray-800 leading-relaxed whitespace-pre-wrap">
              {signal.summary}
            </p>
          </div>
        </section>

        {/* Evidence / Sources */}
        {signal.cluster?.rawItems && signal.cluster.rawItems.length > 0 && (
          <section className="mb-8">
            <h2 className="text-sm font-medium uppercase tracking-wide text-gray-500 mb-3">
              Sources & Evidence
            </h2>
            <ul className="space-y-2">
              {signal.cluster.rawItems.map((item) => (
                <li key={item.id} className="flex items-start gap-2">
                  <span className="text-gray-300 mt-1">•</span>
                  <div>
                    <a 
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm hover:underline"
                    >
                      {item.title}
                    </a>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Related Claims */}
        {signal.cluster?.claims && signal.cluster.claims.length > 0 && (
          <section className="mb-8">
            <h2 className="text-sm font-medium uppercase tracking-wide text-gray-500 mb-3">
              Extracted Claims
            </h2>
            <div className="space-y-3">
              {signal.cluster.claims.map((claim) => (
                <div key={claim.id} className="border-l-2 border-gray-200 pl-4 py-1">
                  <p className="text-sm text-gray-700">{claim.text}</p>
                  {claim.subject && (
                    <p className="text-xs text-gray-400 mt-1">
                      Subject: {claim.subject}
                      {claim.predicate && ` → ${claim.predicate}`}
                      {claim.object && ` → ${claim.object}`}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Reasoning Trail */}
        {signal.reasoningTrail && (
          <section className="mb-8">
            <h2 className="text-sm font-medium uppercase tracking-wide text-gray-500 mb-3">
              How This Was Analyzed
            </h2>
            <ReasoningTrail 
              steps={signal.reasoningTrail.steps} 
              modelInfo={signal.reasoningTrail.modelInfo}
            />
          </section>
        )}

        {/* Cluster Info */}
        <section className="mb-8 pt-6 border-t border-gray-200">
          <h2 className="text-sm font-medium uppercase tracking-wide text-gray-500 mb-3">
            Cluster
          </h2>
          <div className="bg-gray-50 p-4">
            <p className="text-sm font-medium">{signal.cluster?.topic || 'Unknown'}</p>
            <p className="text-xs text-gray-500 mt-1">
              {signal.cluster?.claims?.length || 0} claims • {signal.cluster?.rawItems?.length || 0} sources
            </p>
          </div>
        </section>

        {/* Footer */}
        <footer className="pt-6 border-t border-gray-200 text-xs text-gray-400">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <span>Provenance: {signal.provenance}</span>
              <span className="mx-2">•</span>
              <span>Status: {signal.status}</span>
            </div>
            <Link href="/" className="hover:text-black transition-colors">
              ← All Signals
            </Link>
          </div>
        </footer>
      </main>
    );
  } catch {
    notFound();
  }
}