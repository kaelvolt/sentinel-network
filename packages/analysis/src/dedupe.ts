export interface DeduplicableItem {
  id: string;
  hash: string;
  title: string;
  bodyText: string;
}

export interface DedupeResult<T = DeduplicableItem> {
  unique: T[];
  duplicates: T[];
  stats: {
    inputCount: number;
    uniqueCount: number;
    duplicateCount: number;
  };
}

export function calculateSimilarity(a: DeduplicableItem, b: DeduplicableItem): number {
  // Simple Jaccard similarity on words
  const wordsA = new Set(a.bodyText.toLowerCase().split(/\s+/));
  const wordsB = new Set(b.bodyText.toLowerCase().split(/\s+/));
  const intersection = new Set([...wordsA].filter(x => wordsB.has(x)));
  const union = new Set([...wordsA, ...wordsB]);
  return union.size === 0 ? 0 : intersection.size / union.size;
}

export function deduplicateItems<T extends DeduplicableItem>(
  items: T[],
  existingHashes: Set<string>,
  similarityThreshold: number
): DedupeResult<T> {
  const unique: T[] = [];
  const duplicates: T[] = [];

  for (const item of items) {
    // Check hash first
    if (existingHashes.has(item.hash)) {
      duplicates.push(item);
      continue;
    }

    // Check similarity with accepted unique items
    let isDuplicate = false;
    for (const u of unique) {
      if (calculateSimilarity(item, u) >= similarityThreshold) {
        isDuplicate = true;
        break;
      }
    }

    if (isDuplicate) {
      duplicates.push(item);
    } else {
      unique.push(item);
    }
  }

  return {
    unique,
    duplicates,
    stats: {
      inputCount: items.length,
      uniqueCount: unique.length,
      duplicateCount: duplicates.length,
    },
  };
}
