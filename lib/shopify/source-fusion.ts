/**
 * Weighted Source Fusion Module (CLaRa-Inspired)
 * 
 * Implements the Source Fusion pattern from the CLaRa paper:
 * - Aggregate facts from multiple sources
 * - Weight sources by reliability
 * - Calculate confidence scores for each fact
 * - Flag conflicting information for manual review
 * 
 * Benefits:
 * - More reliable data
 * - Transparent confidence levels
 * - Automatic conflict detection
 */

// ============================================================================
// Types
// ============================================================================

export interface SourceFact {
  value: string;
  source: string;
  sourceType: SourceType;
  reliability: number; // 0-100
  timestamp?: Date;
  url?: string;
}

export type SourceType = 
  | 'official'        // Manufacturer website
  | 'manual'          // Official PDF manual
  | 'retailer_major'  // Amazon, major retailers
  | 'retailer_niche'  // Specialized tool retailers
  | 'review_pro'      // Pro Tool Reviews, ToolGuyd
  | 'forum'           // Reddit, forums
  | 'user_review';    // Individual user reviews

export interface FusedFact {
  key: string;
  value: string;
  confidence: number; // 0-100
  sources: SourceFact[];
  conflicting: boolean;
  conflicts?: ConflictInfo[];
  needsVerification: boolean;
  verificationReason?: string;
}

export interface ConflictInfo {
  value1: string;
  source1: string;
  value2: string;
  source2: string;
  difference: string;
}

export interface FusionResult {
  facts: FusedFact[];
  overallConfidence: number;
  conflictCount: number;
  verificationNeeded: string[];
  fusionTime: number;
}

// ============================================================================
// Source Reliability Weights
// ============================================================================

const SOURCE_RELIABILITY: Record<SourceType, number> = {
  official: 100,
  manual: 95,
  retailer_major: 75,
  retailer_niche: 80,
  review_pro: 85,
  forum: 60,
  user_review: 50,
};

// ============================================================================
// Fact Grouping
// ============================================================================

/**
 * Group similar facts by their key (e.g., "torque", "weight")
 */
export function groupFactsByKey(
  facts: Array<{ key: string; value: string; source: string; sourceType: SourceType; url?: string }>
): Map<string, SourceFact[]> {
  const groups = new Map<string, SourceFact[]>();

  for (const fact of facts) {
    const normalizedKey = normalizeFactKey(fact.key);
    
    const sourceFact: SourceFact = {
      value: fact.value,
      source: fact.source,
      sourceType: fact.sourceType,
      reliability: SOURCE_RELIABILITY[fact.sourceType],
      url: fact.url,
    };

    if (groups.has(normalizedKey)) {
      groups.get(normalizedKey)!.push(sourceFact);
    } else {
      groups.set(normalizedKey, [sourceFact]);
    }
  }

  return groups;
}

/**
 * Normalize fact keys for grouping
 */
function normalizeFactKey(key: string): string {
  return key
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

// ============================================================================
// Value Comparison
// ============================================================================

/**
 * Check if two values are essentially the same
 */
function valuesMatch(value1: string, value2: string): boolean {
  // Normalize values
  const v1 = normalizeValue(value1);
  const v2 = normalizeValue(value2);

  // Exact match
  if (v1 === v2) return true;

  // Numeric comparison with tolerance
  const num1 = extractNumber(v1);
  const num2 = extractNumber(v2);
  
  if (num1 !== null && num2 !== null) {
    const tolerance = Math.max(num1, num2) * 0.05; // 5% tolerance
    return Math.abs(num1 - num2) <= tolerance;
  }

  return false;
}

function normalizeValue(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/,/g, '.')
    .trim();
}

function extractNumber(value: string): number | null {
  const match = value.match(/[\d.]+/);
  if (match) {
    const num = parseFloat(match[0]);
    return isNaN(num) ? null : num;
  }
  return null;
}

// ============================================================================
// Conflict Detection
// ============================================================================

/**
 * Detect conflicts within a group of facts
 */
function detectConflicts(facts: SourceFact[]): ConflictInfo[] {
  const conflicts: ConflictInfo[] = [];

  for (let i = 0; i < facts.length; i++) {
    for (let j = i + 1; j < facts.length; j++) {
      if (!valuesMatch(facts[i].value, facts[j].value)) {
        conflicts.push({
          value1: facts[i].value,
          source1: facts[i].source,
          value2: facts[j].value,
          source2: facts[j].source,
          difference: calculateDifference(facts[i].value, facts[j].value),
        });
      }
    }
  }

  return conflicts;
}

function calculateDifference(value1: string, value2: string): string {
  const num1 = extractNumber(value1);
  const num2 = extractNumber(value2);

  if (num1 !== null && num2 !== null) {
    const diff = Math.abs(num1 - num2);
    const percentDiff = ((diff / Math.max(num1, num2)) * 100).toFixed(1);
    return `${diff} (${percentDiff}% difference)`;
  }

  return 'Values differ';
}

// ============================================================================
// Confidence Calculation
// ============================================================================

/**
 * Calculate confidence score for a fused fact
 */
function calculateConfidence(facts: SourceFact[], hasConflicts: boolean): number {
  if (facts.length === 0) return 0;

  // Base confidence from highest reliability source
  const maxReliability = Math.max(...facts.map(f => f.reliability));
  
  // Bonus for multiple sources agreeing
  const agreementBonus = Math.min(facts.length - 1, 3) * 5; // Max +15 for 4+ sources
  
  // Penalty for conflicts
  const conflictPenalty = hasConflicts ? 20 : 0;
  
  // Calculate final confidence
  let confidence = maxReliability + agreementBonus - conflictPenalty;
  
  // Clamp to 0-100
  return Math.max(0, Math.min(100, confidence));
}

// ============================================================================
// Value Selection
// ============================================================================

/**
 * Select the best value from a group of facts
 */
function selectBestValue(facts: SourceFact[]): string {
  // Sort by reliability (highest first)
  const sorted = [...facts].sort((a, b) => b.reliability - a.reliability);
  
  // Return the value from the most reliable source
  return sorted[0].value;
}

// ============================================================================
// Main Fusion Function
// ============================================================================

export function fuseSources(
  rawFacts: Array<{ key: string; value: string; source: string; sourceType: SourceType; url?: string }>
): FusionResult {
  const startTime = Date.now();
  
  // Group facts by key
  const groups = groupFactsByKey(rawFacts);
  
  const fusedFacts: FusedFact[] = [];
  let totalConflicts = 0;
  const verificationNeeded: string[] = [];

  // Process each group
  for (const [key, facts] of groups) {
    // Detect conflicts
    const conflicts = detectConflicts(facts);
    const hasConflicts = conflicts.length > 0;
    
    if (hasConflicts) {
      totalConflicts += conflicts.length;
    }

    // Calculate confidence
    const confidence = calculateConfidence(facts, hasConflicts);
    
    // Select best value
    const value = selectBestValue(facts);
    
    // Determine if verification is needed
    let needsVerification = false;
    let verificationReason: string | undefined;
    
    if (hasConflicts && conflicts.some(c => {
      const num1 = extractNumber(c.value1);
      const num2 = extractNumber(c.value2);
      if (num1 && num2) {
        return Math.abs(num1 - num2) / Math.max(num1, num2) > 0.1; // >10% difference
      }
      return true;
    })) {
      needsVerification = true;
      verificationReason = `Conflicting values from ${conflicts.length} source pairs`;
      verificationNeeded.push(key);
    }
    
    if (confidence < 70 && facts.length < 2) {
      needsVerification = true;
      verificationReason = 'Low confidence with single source';
      if (!verificationNeeded.includes(key)) {
        verificationNeeded.push(key);
      }
    }

    fusedFacts.push({
      key,
      value,
      confidence,
      sources: facts,
      conflicting: hasConflicts,
      conflicts: hasConflicts ? conflicts : undefined,
      needsVerification,
      verificationReason,
    });
  }

  // Calculate overall confidence
  const overallConfidence = fusedFacts.length > 0
    ? Math.round(fusedFacts.reduce((sum, f) => sum + f.confidence, 0) / fusedFacts.length)
    : 0;

  return {
    facts: fusedFacts,
    overallConfidence,
    conflictCount: totalConflicts,
    verificationNeeded,
    fusionTime: Date.now() - startTime,
  };
}

// ============================================================================
// Utility: Generate Safety Report
// ============================================================================

export function generateFusionReport(result: FusionResult): string {
  const lines: string[] = [
    '=== SOURCE FUSION REPORT ===',
    '',
    `Overall Confidence: ${result.overallConfidence}%`,
    `Total Facts: ${result.facts.length}`,
    `Conflicts Detected: ${result.conflictCount}`,
    `Facts Needing Verification: ${result.verificationNeeded.length}`,
    '',
  ];

  if (result.verificationNeeded.length > 0) {
    lines.push('⚠️ MANUAL VERIFICATION REQUIRED:');
    for (const key of result.verificationNeeded) {
      const fact = result.facts.find(f => f.key === key);
      if (fact) {
        lines.push(`  - ${key}: ${fact.verificationReason}`);
        if (fact.conflicts) {
          for (const conflict of fact.conflicts) {
            lines.push(`    → ${conflict.source1}: "${conflict.value1}" vs ${conflict.source2}: "${conflict.value2}"`);
          }
        }
      }
    }
    lines.push('');
  }

  lines.push('FUSED FACTS:');
  for (const fact of result.facts) {
    const status = fact.conflicting ? '⚠️' : '✓';
    const confidence = fact.confidence >= 80 ? '🟢' : fact.confidence >= 60 ? '🟡' : '🔴';
    lines.push(`  ${status} ${fact.key}: ${fact.value} ${confidence} (${fact.confidence}% confidence, ${fact.sources.length} sources)`);
  }

  return lines.join('\n');
}

// ============================================================================
// Utility: Convert to Product Specs
// ============================================================================

export function fusionResultToSpecs(result: FusionResult): {
  specs: Record<string, string>;
  highConfidence: string[];
  lowConfidence: string[];
  conflicts: string[];
} {
  const specs: Record<string, string> = {};
  const highConfidence: string[] = [];
  const lowConfidence: string[] = [];
  const conflicts: string[] = [];

  for (const fact of result.facts) {
    specs[fact.key] = fact.value;
    
    if (fact.confidence >= 80) {
      highConfidence.push(fact.key);
    } else if (fact.confidence < 60) {
      lowConfidence.push(fact.key);
    }
    
    if (fact.conflicting) {
      conflicts.push(fact.key);
    }
  }

  return { specs, highConfidence, lowConfidence, conflicts };
}
