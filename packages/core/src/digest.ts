/**
 * Digest Publisher
 * Generates "Daily Digest" markdown from signals
 */

import { prisma } from '@kael/storage';
import { logger } from './logger/index.js';
import { ConfidenceLabel, SeverityLevel } from '@kael/shared';

export interface DigestSignal {
  id: string;
  title: string;
  summary: string;
  severity: SeverityLevel;
  confidenceLabel: ConfidenceLabel;
  confidence: number;
  tags: string[];
  cluster: {
    topic: string;
    rawItems: Array<{
      url: string;
      title: string;
      source: { name: string; kind: string };
    }>;
  };
  createdAt: Date;
}

export interface GeneratedDigest {
  periodStart: Date;
  periodEnd: Date;
  title: string;
  content: string;
  summary: string;
  signalIds: string[];
  signalCount: number;
  kaelNotes: string;
}

const SEVERITY_LABELS: Record<SeverityLevel, string> = {
  [SeverityLevel.NONE]: '🟢 None',
  [SeverityLevel.MINIMAL]: '⚪ Minimal',
  [SeverityLevel.LOW]: '🟡 Low',
  [SeverityLevel.MODERATE]: '🟠 Moderate',
  [SeverityLevel.HIGH]: '🔴 High',
  [SeverityLevel.CRITICAL]: '🚨 Critical',
};

const CONFIDENCE_INDICATORS: Record<ConfidenceLabel, string> = {
  [ConfidenceLabel.LOW]: '❓',
  [ConfidenceLabel.MED]: '✓',
  [ConfidenceLabel.HIGH]: '✓✓',
};

/**
 * Fetch signals from the last N hours
 */
export async function fetchRecentSignals(hoursBack: number = 24): Promise<DigestSignal[]> {
  const cutoff = new Date(Date.now() - hoursBack * 60 * 60 * 1000);
  
  const signals = await prisma.signal.findMany({
    where: {
      createdAt: { gte: cutoff },
      status: { in: ['active', 'draft'] },
    },
    include: {
      cluster: {
        include: {
          rawItems: {
            include: {
              rawItem: {
                include: {
                  source: { select: { name: true, kind: true } },
                },
              },
            },
          },
        },
      },
    },
    orderBy: [{ severity: 'desc' }, { confidence: 'desc' }, { createdAt: 'desc' }],
  });
  
  return signals.map(s => ({
    id: s.id,
    title: s.title,
    summary: s.summary,
    severity: s.severity as SeverityLevel,
    confidenceLabel: s.confidenceLabel as ConfidenceLabel,
    confidence: s.confidence,
    tags: s.tags,
    cluster: {
      topic: s.cluster.topic,
      rawItems: s.cluster.rawItems.slice(0, 3).map(ri => ({
        url: ri.rawItem.url,
        title: ri.rawItem.title,
        source: ri.rawItem.source,
      })),
    },
    createdAt: s.createdAt,
  }));
}

/**
 * Group signals by tag/topic
 */
export function groupSignalsByTopic(signals: DigestSignal[]): Map<string, DigestSignal[]> {
  const groups = new Map<string, DigestSignal[]>();
  
  for (const signal of signals) {
    const key = signal.tags[0] || signal.cluster.topic || 'Uncategorized';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(signal);
  }
  
  for (const [, group] of groups) {
    group.sort((a, b) => {
      if (b.severity !== a.severity) return b.severity - a.severity;
      return b.confidence - a.confidence;
    });
  }
  
  return groups;
}

/**
 * Generate markdown for a single signal
 */
function generateSignalMarkdown(signal: DigestSignal, index: number): string {
  const lines: string[] = [];
  const severityLabel = SEVERITY_LABELS[signal.severity] || SEVERITY_LABELS[SeverityLevel.NONE];
  const confidenceIndicator = CONFIDENCE_INDICATORS[signal.confidenceLabel] || '❓';
  
  lines.push(`### ${index + 1}. ${signal.title}`);
  lines.push(`**${severityLabel}** | Confidence: ${confidenceIndicator} ${signal.confidenceLabel} (${(signal.confidence * 100).toFixed(0)}%)`);
  lines.push('');
  lines.push(signal.summary.substring(0, 300));
  if (signal.summary.length > 300) lines.push('...');
  lines.push('');
  
  if (signal.cluster.rawItems.length > 0) {
    lines.push('**Sources:**');
    for (const rawItem of signal.cluster.rawItems) {
      lines.push(`- [${rawItem.source.name}](${rawItem.url}) — ${rawItem.title.substring(0, 80)}`);
    }
    lines.push('');
  }
  
  if (signal.tags.length > 0) {
    lines.push(`*Tags: ${signal.tags.join(', ')}*`);
    lines.push('');
  }
  
  lines.push('---');
  lines.push('');
  
  return lines.join('\n');
}

/**
 * Generate "Kael's Notes" section
 */
function generateKaelNotes(signals: DigestSignal[]): string {
  const lines: string[] = [];
  lines.push("## Kael's Notes");
  lines.push('');
  
  const lowConfidenceCount = signals.filter(s => s.confidenceLabel === ConfidenceLabel.LOW).length;
  const totalCount = signals.length;
  
  if (lowConfidenceCount > 0) {
    lines.push(`⚠️ **Uncertainty Alert:** ${lowConfidenceCount} of ${totalCount} signals have LOW confidence.`);
    lines.push('');
  }
  
  const highSeveritySignals = signals.filter(s => s.severity >= SeverityLevel.HIGH);
  const watchTopics = [...new Set(highSeveritySignals.map(s => s.cluster.topic))].slice(0, 3);
  
  if (watchTopics.length > 0) {
    lines.push('👁️ **What to Watch:**');
    lines.push('');
    for (const topic of watchTopics) {
      lines.push(`- **${topic}** — High severity developments detected`);
    }
    lines.push('');
  }
  
  lines.push('**Assessment Method:**');
  lines.push('- Signals are generated via heuristic analysis of public sources');
  lines.push('- Confidence reflects source reliability, corroboration, and recency');
  lines.push('- Always verify with primary sources before acting');
  lines.push('');
  lines.push('---');
  lines.push('');
  
  return lines.join('\n');
}

/**
 * Generate full digest markdown
 */
export function generateDigestMarkdown(
  signals: DigestSignal[],
  periodStart: Date,
  periodEnd: Date
): GeneratedDigest {
  const lines: string[] = [];
  const dateStr = periodEnd.toISOString().split('T')[0];
  const title = `Daily Digest — ${dateStr}`;
  
  lines.push(`# ${title}`);
  lines.push('');
  lines.push(`*Period: ${periodStart.toISOString()} to ${periodEnd.toISOString()}*`);
  lines.push('');
  
  const criticalCount = signals.filter(s => s.severity === SeverityLevel.CRITICAL).length;
  const highCount = signals.filter(s => s.severity === SeverityLevel.HIGH).length;
  
  lines.push('## Summary');
  lines.push('');
  lines.push(`**${signals.length} signals** analyzed`);
  if (criticalCount > 0) lines.push(`- 🚨 ${criticalCount} Critical`);
  if (highCount > 0) lines.push(`- 🔴 ${highCount} High severity`);
  lines.push('');
  
  const groups = groupSignalsByTopic(signals);
  
  if (groups.size === 0) {
    lines.push('*No significant signals detected.*');
    lines.push('');
  } else {
    for (const [topic, topicSignals] of groups) {
      lines.push(`## ${topic}`);
      lines.push('');
      for (let i = 0; i < topicSignals.length; i++) {
        lines.push(generateSignalMarkdown(topicSignals[i], i));
      }
    }
  }
  
  lines.push(generateKaelNotes(signals));
  
  lines.push('## About');
  lines.push('');
  lines.push('This digest is automatically generated by Kael, a civic intelligence system.');
  lines.push('- Signals sourced from public RSS feeds and official sources');
  lines.push('- Content analyzed for relevance, severity, and confidence');
  lines.push('- No personal data collected or processed');
  lines.push('');
  lines.push(`*Generated: ${new Date().toISOString()}*`);
  
  const content = lines.join('\n');
  
  const summaryLines: string[] = [];
  summaryLines.push(`${signals.length} signals.`);
  if (criticalCount > 0) summaryLines.push(`${criticalCount} critical.`);
  if (highCount > 0) summaryLines.push(`${highCount} high severity.`);
  summaryLines.push(`Topics: ${[...groups.keys()].slice(0, 5).join(', ')}`);
  
  return {
    periodStart,
    periodEnd,
    title,
    content,
    summary: summaryLines.join(' '),
    signalIds: signals.map(s => s.id),
    signalCount: signals.length,
    kaelNotes: generateKaelNotes(signals),
  };
}

/**
 * Generate and store a digest
 */
export async function generateAndStoreDigest(hoursBack: number = 24): Promise<{ digestId: string; signalCount: number }> {
  const periodEnd = new Date();
  const periodStart = new Date(Date.now() - hoursBack * 60 * 60 * 1000);
  
  logger.info('Generating digest', { periodStart, periodEnd });
  
  const signals = await fetchRecentSignals(hoursBack);
  
  if (signals.length === 0) {
    logger.info('No signals found for digest period');
    const digest = await prisma.digest.create({
      data: {
        periodStart,
        periodEnd,
        title: `Daily Digest — ${dateStr}`,
        content: '# Daily Digest\n\n*No signals detected.*',
        summary: 'No signals.',
        signalIds: [],
        signalCount: 0,
        kaelNotes: 'No activity.',
        published: false,
      },
    });
    return { digestId: digest.id, signalCount: 0 };
  }
  
  const generated = generateDigestMarkdown(signals, periodStart, periodEnd);
  
  const digest = await prisma.digest.create({
    data: {
      periodStart: generated.periodStart,
      periodEnd: generated.periodEnd,
      title: generated.title,
      content: generated.content,
      summary: generated.summary,
      signalIds: generated.signalIds,
      signalCount: generated.signalCount,
      kaelNotes: generated.kaelNotes,
      published: false,
    },
  });
  
  logger.info('Digest generated', { digestId: digest.id, signalCount: signals.length });
  
  return { digestId: digest.id, signalCount: signals.length };
}

/**
 * Get latest digest
 */
export async function getLatestDigest() {
  const digest = await prisma.digest.findFirst({
    orderBy: { createdAt: 'desc' },
  });
  
  if (!digest) return null;
  
  return {
    id: digest.id,
    title: digest.title,
    content: digest.content,
    summary: digest.summary,
    kaelNotes: digest.kaelNotes,
    signalCount: digest.signalCount,
    createdAt: digest.createdAt,
    published: digest.published,
  };
}

/**
 * Get digest history
 */
export async function getDigestHistory(limit: number = 10) {
  const digests = await prisma.digest.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      id: true,
      title: true,
      summary: true,
      signalCount: true,
      createdAt: true,
      published: true,
    },
  });
  
  return digests;
}
