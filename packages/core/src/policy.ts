/**
 * Safety and Ethics Policy Gates
 * Implements the boundaries defined in KAEL.md
 */

import { logger } from './logger/index.js';

export interface PolicyCheck {
  passed: boolean;
  reason?: string;
  severity: 'block' | 'warn' | 'pass';
}

export interface ContentCheck {
  title: string;
  bodyText: string;
  author?: string | null;
  url: string;
}

// Patterns that indicate personal data
const PERSONAL_DATA_PATTERNS = [
  // Social Security Numbers (various formats)
  /\b\d{3}[-.]?\d{2}[-.]?\d{4}\b/,
  // Credit card numbers
  /\b(?:\d{4}[- ]?){3}\d{4}\b/,
  // Email addresses
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/,
  // Phone numbers (various formats)
  /\b(?:\+?1[-.]?)?\(?\d{3}\)?[-.]?\d{3}[-.]?\d{4}\b/,
  // Home addresses (simple pattern: number + street name)
  /\b\d+\s+\d*\s*[A-Za-z]+\s+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way|Court|Ct|Place|Pl|Circle|Cir)\b/i,
];

// Patterns for doxxing indicators
const DOXXING_PATTERNS = [
  // Home address sharing
  /\blives\s+(?:at|on)\b/i,
  /\bhome\s+address\b/i,
  // Family member targeting
  /\b(?:spouse|wife|husband|children|kids?|family)\s+(?:of|is)\b/i,
  // Location tracking
  /\b(?:current|exact)\s+location\b/i,
  // Private contact info
  /\b(?:private|personal|home|cell|mobile)\s+(?:phone|number|email)\b/i,
];

// Patterns for harmful instructions
const HARMFUL_INSTRUCTION_PATTERNS = [
  // Violence instructions
  /\bhow\s+(?:to|do)\s+.*\b(?:kill|murder|assassinate|harm|hurt|attack)\b/i,
  // Weapon instructions
  /\bhow\s+(?:to|do)\s+.*\b(?:bomb|weapon|explosive|poison|toxin)\b/i,
  // Hacking instructions
  /\bhow\s+(?:to|do)\s+.*\b(?:hack|crack|breach|penetrate)\s+(?:into|database|system|account)\b/i,
  // Self-harm
  /\bhow\s+(?:to|do)\s+.*\b(?:suicide|self[- ]?harm|kill\s+myself)\b/i,
  // Fraud instructions
  /\bhow\s+(?:to|do)\s+.*\b(?:fraud|scam|steal|identity\s+theft|forge)\b/i,
];

// Civic relevance keywords (positive indicator)
const CIVIC_RELEVANCE_KEYWORDS = [
  'government', 'policy', 'legislation', 'regulation', 'public', 'civic',
  'election', 'vote', 'candidate', 'mayor', 'council', 'senate', 'congress',
  'court', 'judge', 'legal', 'law', 'bill', 'act', 'ordinance',
  'tax', 'budget', 'spending', 'infrastructure', 'school', 'education',
  'healthcare', 'environment', 'climate', 'energy', 'transportation',
  'housing', 'police', 'safety', 'emergency', 'disaster', 'relief',
  'corruption', 'transparency', 'accountability', 'watchdog',
];

/**
 * Check for personal data patterns in content
 */
export function checkPersonalData(content: ContentCheck): PolicyCheck {
  const textToCheck = `${content.title} ${content.bodyText}`;
  
  for (const pattern of PERSONAL_DATA_PATTERNS) {
    const matches = textToCheck.match(pattern);
    if (matches && matches.length > 0) {
      logger.warn('Personal data pattern detected', {
        pattern: pattern.toString(),
        url: content.url,
        matches: matches.slice(0, 3), // Log first 3 matches
      });
      
      return {
        passed: false,
        reason: `Personal data pattern detected: ${pattern.toString()}`,
        severity: 'block',
      };
    }
  }
  
  return { passed: true, severity: 'pass' };
}

/**
 * Check for doxxing patterns
 */
export function checkDoxxing(content: ContentCheck): PolicyCheck {
  const textToCheck = `${content.title} ${content.bodyText}`;
  
  for (const pattern of DOXXING_PATTERNS) {
    if (pattern.test(textToCheck)) {
      logger.warn('Potential doxxing content detected', {
        pattern: pattern.toString(),
        url: content.url,
      });
      
      return {
        passed: false,
        reason: `Potential doxxing content: ${pattern.toString()}`,
        severity: 'block',
      };
    }
  }
  
  return { passed: true, severity: 'pass' };
}

/**
 * Check for harmful instructions
 */
export function checkHarmfulInstructions(content: ContentCheck): PolicyCheck {
  const textToCheck = `${content.title} ${content.bodyText}`;
  
  for (const pattern of HARMFUL_INSTRUCTION_PATTERNS) {
    if (pattern.test(textToCheck)) {
      logger.error('Harmful instruction pattern detected', {
        pattern: pattern.toString(),
        url: content.url,
      });
      
      return {
        passed: false,
        reason: `Harmful instruction content blocked: ${pattern.toString()}`,
        severity: 'block',
      };
    }
  }
  
  return { passed: true, severity: 'pass' };
}

/**
 * Check civic relevance (informational, not a hard block)
 */
export function checkCivicRelevance(content: ContentCheck): PolicyCheck {
  const textToCheck = `${content.title} ${content.bodyText}`.toLowerCase();
  
  const matches = CIVIC_RELEVANCE_KEYWORDS.filter(keyword => 
    textToCheck.includes(keyword.toLowerCase())
  );
  
  if (matches.length === 0) {
    return {
      passed: true, // Allow through but flag as low civic relevance
      reason: 'No civic relevance keywords detected',
      severity: 'warn',
    };
  }
  
  return {
    passed: true,
    reason: `Civic relevance keywords: ${matches.slice(0, 5).join(', ')}`,
    severity: 'pass',
  };
}

/**
 * Run all policy checks on content
 */
export function checkContent(content: ContentCheck): { allowed: boolean; checks: Record<string, PolicyCheck> } {
  const checks = {
    personalData: checkPersonalData(content),
    doxxing: checkDoxxing(content),
    harmfulInstructions: checkHarmfulInstructions(content),
    civicRelevance: checkCivicRelevance(content),
  };
  
  // Content is blocked if any check has severity 'block'
  const blocked = Object.values(checks).some(check => check.severity === 'block');
  
  if (blocked) {
    logger.warn('Content blocked by policy gate', {
      url: content.url,
      failedChecks: Object.entries(checks)
        .filter(([, check]) => !check.passed)
        .map(([name]) => name),
    });
  }
  
  return {
    allowed: !blocked,
    checks,
  };
}

/**
 * Check source policy against content
 * Returns true if content passes source-specific filters
 */
export function checkSourcePolicy(
  content: ContentCheck,
  sourcePolicy: Record<string, unknown> | null
): PolicyCheck {
  if (!sourcePolicy) {
    return { passed: true, severity: 'pass' };
  }
  
  // Check allowed topics
  if (sourcePolicy.allowedTopics && Array.isArray(sourcePolicy.allowedTopics)) {
    const allowedTopics = sourcePolicy.allowedTopics as string[];
    const textToCheck = `${content.title} ${content.bodyText}`.toLowerCase();
    
    const hasAllowedTopic = allowedTopics.some(topic => 
      textToCheck.includes(topic.toLowerCase())
    );
    
    if (!hasAllowedTopic) {
      return {
        passed: false,
        reason: `Content does not match allowed topics: ${allowedTopics.join(', ')}`,
        severity: 'block',
      };
    }
  }
  
  // Check disallowed topics
  if (sourcePolicy.disallowedTopics && Array.isArray(sourcePolicy.disallowedTopics)) {
    const disallowedTopics = sourcePolicy.disallowedTopics as string[];
    const textToCheck = `${content.title} ${content.bodyText}`.toLowerCase();
    
    const hasDisallowedTopic = disallowedTopics.some(topic => 
      textToCheck.includes(topic.toLowerCase())
    );
    
    if (hasDisallowedTopic) {
      return {
        passed: false,
        reason: `Content matches disallowed topic: ${disallowedTopics.join(', ')}`,
        severity: 'block',
      };
    }
  }
  
  // Check content filters (regex patterns)
  if (sourcePolicy.contentFilters && Array.isArray(sourcePolicy.contentFilters)) {
    const filters = sourcePolicy.contentFilters as string[];
    const textToCheck = `${content.title} ${content.bodyText}`;
    
    for (const filterStr of filters) {
      try {
        const regex = new RegExp(filterStr, 'i');
        if (regex.test(textToCheck)) {
          return {
            passed: false,
            reason: `Content matches filter pattern: ${filterStr}`,
            severity: 'block',
          };
        }
      } catch {
        // Invalid regex, skip
        logger.warn('Invalid content filter regex', { pattern: filterStr });
      }
    }
  }
  
  return { passed: true, severity: 'pass' };
}
