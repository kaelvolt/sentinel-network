export interface SummarizableItem {
  id: string;
  title: string;
  bodyText: string;
}

export interface SummaryResult {
  summary: string;
  keyPoints: string[];
  itemCount: number;
}

export function summarizeCluster(items: SummarizableItem[]): SummaryResult {
  // Extract most common words as key phrases
  const wordFreq = new Map<string, number>();

  for (const item of items) {
    const words = (item.title + " " + item.bodyText)
      .toLowerCase()
      .replace(/[^\w\s]/g, "")
      .split(/\s+/)
      .filter(w => w.length > 4);

    for (const word of words) {
      wordFreq.set(word, (wordFreq.get(word) || 0) + 1);
    }
  }

  // Get top key phrases
  const keyPoints = Array.from(wordFreq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([word]) => word);

  // Create summary from the most representative item (longest body text)
  const representativeItem = items.reduce((longest, current) =>
    current.bodyText.length > longest.bodyText.length ? current : longest
  );

  // Extract first sentence or first 200 chars
  const firstSentence = representativeItem.bodyText.split(/[.!?]/)[0] || "";
  const summary = firstSentence.length > 50
    ? firstSentence + "."
    : representativeItem.bodyText.substring(0, 200) + "...";

  return {
    summary,
    keyPoints,
    itemCount: items.length,
  };
}

export function createSignalSummary(
  topic: string,
  representativeText: string,
  itemCount: number,
  confidence: number
): string {
  const confidenceWord = confidence > 0.8 ? "highly reliable" : confidence > 0.5 ? "moderately reliable" : "emerging";
  const itemWord = itemCount === 1 ? "item" : "items";

  return `${topic}: ${representativeText.substring(0, 150)}... Based on ${itemCount} ${itemWord}. Confidence: ${confidenceWord}.`;
}
