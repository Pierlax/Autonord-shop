/**
 * Proactive Cross-Source Fusion - UniversalRAG Implementation
 * 
 * Based on "UniversalRAG: Retrieval-Augmented Generation over Corpora 
 * of Diverse Modalities and Granularities" (KAIST, 2026)
 * 
 * Unlike reactive fusion (combining results AFTER retrieval), proactive
 * fusion plans which sources to combine BEFORE retrieval based on query
 * requirements. This enables:
 * 
 * 1. Intentional multi-source retrieval for complex queries
 * 2. Evidence triangulation from complementary sources
 * 3. Reduced noise by avoiding irrelevant sources
 */

import { SourceType, RoutingDecision, routeProductQuery } from './source-router';
import { GranularityLevel, GranularityDecision, determineGranularity } from './granularity-retrieval';
import { RetrievalDecision, decideRetrievalStrategy } from './no-retrieval-detector';

// Evidence types that can be combined
export type EvidenceType = 
  | 'factual'          // Hard facts, specifications
  | 'experiential'     // User experiences, reviews
  | 'comparative'      // Comparisons, benchmarks
  | 'instructional'    // How-to, tutorials
  | 'pricing';         // Cost, value data

// Fusion strategy based on query needs
export type FusionStrategy = 
  | 'single_source'    // One authoritative source is enough
  | 'triangulation'    // Cross-validate from multiple sources
  | 'complementary'    // Combine different types of evidence
  | 'comprehensive';   // Full coverage from all relevant sources

export interface FusionPlan {
  strategy: FusionStrategy;
  evidenceTypes: EvidenceType[];
  sourceGroups: SourceGroup[];
  expectedCoverage: number; // 0-1, how much of the query this plan covers
  reasoning: string;
}

export interface SourceGroup {
  sources: SourceType[];
  evidenceType: EvidenceType;
  priority: number; // 1 = highest
  required: boolean;
  granularity: GranularityLevel;
}

export interface FusionResult {
  combinedEvidence: CombinedEvidence[];
  coverageScore: number;
  conflictsDetected: Conflict[];
  confidenceScore: number;
}

export interface CombinedEvidence {
  field: string;
  value: string;
  sources: { source: SourceType; confidence: number }[];
  evidenceType: EvidenceType;
  isVerified: boolean;
}

export interface Conflict {
  field: string;
  values: { value: string; source: SourceType }[];
  resolution: string;
  resolvedValue: string;
}

// Query patterns that benefit from specific fusion strategies
const FUSION_STRATEGY_PATTERNS: { pattern: RegExp; strategy: FusionStrategy; evidenceTypes: EvidenceType[] }[] = [
  // Triangulation needed - verify facts from multiple sources
  { 
    pattern: /specifiche|specifications|scheda tecnica|datasheet/i, 
    strategy: 'triangulation', 
    evidenceTypes: ['factual'] 
  },
  
  // Complementary - combine different evidence types
  { 
    pattern: /vale la pena|worth it|conviene|should i buy/i, 
    strategy: 'complementary', 
    evidenceTypes: ['factual', 'experiential', 'pricing'] 
  },
  { 
    pattern: /pro e contro|pros and cons|vantaggi e svantaggi/i, 
    strategy: 'complementary', 
    evidenceTypes: ['factual', 'experiential'] 
  },
  
  // Comprehensive - need full picture
  { 
    pattern: /recensione completa|full review|analisi completa/i, 
    strategy: 'comprehensive', 
    evidenceTypes: ['factual', 'experiential', 'comparative', 'pricing'] 
  },
  { 
    pattern: /confronto|comparison|vs|versus/i, 
    strategy: 'comprehensive', 
    evidenceTypes: ['factual', 'comparative', 'experiential'] 
  },
  
  // Single source sufficient
  { 
    pattern: /prezzo|price|costo|cost/i, 
    strategy: 'single_source', 
    evidenceTypes: ['pricing'] 
  },
  { 
    pattern: /come si usa|how to use|istruzioni/i, 
    strategy: 'single_source', 
    evidenceTypes: ['instructional'] 
  },
];

// Source-to-evidence type mapping
const SOURCE_EVIDENCE_MAPPING: Record<SourceType, EvidenceType[]> = {
  official_specs: ['factual'],
  official_manuals: ['factual', 'instructional'],
  retailer_data: ['factual', 'pricing'],
  user_reviews: ['experiential'],
  forum_discussions: ['experiential', 'instructional'],
  comparison_sites: ['comparative', 'factual'],
  video_content: ['experiential', 'instructional', 'comparative'],
};

/**
 * Create a proactive fusion plan based on query analysis
 */
export async function createFusionPlan(
  productTitle: string,
  vendor: string,
  productType: string,
  enrichmentType: 'specs' | 'description' | 'pros_cons' | 'faqs' | 'full'
): Promise<FusionPlan> {
  // Get routing decision
  const routingDecision = await routeProductQuery(productTitle, vendor, productType);
  
  // Get granularity decision
  const granularityDecision = await determineGranularity(productTitle, vendor, enrichmentType);
  
  // Determine fusion strategy based on enrichment type
  const strategyMapping: Record<string, { strategy: FusionStrategy; evidenceTypes: EvidenceType[] }> = {
    specs: { 
      strategy: 'triangulation', 
      evidenceTypes: ['factual'] 
    },
    description: { 
      strategy: 'complementary', 
      evidenceTypes: ['factual', 'experiential'] 
    },
    pros_cons: { 
      strategy: 'complementary', 
      evidenceTypes: ['experiential', 'comparative'] 
    },
    faqs: { 
      strategy: 'complementary', 
      evidenceTypes: ['factual', 'experiential', 'instructional'] 
    },
    full: { 
      strategy: 'comprehensive', 
      evidenceTypes: ['factual', 'experiential', 'comparative', 'pricing'] 
    },
  };
  
  const { strategy, evidenceTypes } = strategyMapping[enrichmentType] || strategyMapping.full;
  
  // Build source groups based on evidence types needed
  const sourceGroups = buildSourceGroups(
    evidenceTypes,
    routingDecision,
    granularityDecision.level
  );
  
  return {
    strategy,
    evidenceTypes,
    sourceGroups,
    expectedCoverage: calculateExpectedCoverage(sourceGroups, evidenceTypes),
    reasoning: `${strategy} strategy for ${enrichmentType} enrichment of ${vendor} ${productTitle}`,
  };
}

/**
 * Build source groups for each evidence type
 */
function buildSourceGroups(
  evidenceTypes: EvidenceType[],
  routingDecision: RoutingDecision,
  granularity: GranularityLevel
): SourceGroup[] {
  const groups: SourceGroup[] = [];
  let priority = 1;
  
  for (const evidenceType of evidenceTypes) {
    // Find sources that provide this evidence type
    const matchingSources: SourceType[] = [];
    
    for (const [source, types] of Object.entries(SOURCE_EVIDENCE_MAPPING)) {
      if (types.includes(evidenceType)) {
        matchingSources.push(source as SourceType);
      }
    }
    
    // Prioritize sources from routing decision
    const prioritizedSources = matchingSources.sort((a, b) => {
      const aInPrimary = routingDecision.primarySources.includes(a) ? 0 : 1;
      const bInPrimary = routingDecision.primarySources.includes(b) ? 0 : 1;
      return aInPrimary - bInPrimary;
    });
    
    groups.push({
      sources: prioritizedSources.slice(0, 3), // Max 3 sources per evidence type
      evidenceType,
      priority: priority++,
      required: priority <= 2, // First two evidence types are required
      granularity,
    });
  }
  
  return groups;
}

/**
 * Calculate expected coverage based on source groups
 */
function calculateExpectedCoverage(
  sourceGroups: SourceGroup[],
  evidenceTypes: EvidenceType[]
): number {
  if (evidenceTypes.length === 0) return 0;
  
  let coveredTypes = 0;
  for (const evidenceType of evidenceTypes) {
    const hasGroup = sourceGroups.some(g => g.evidenceType === evidenceType && g.sources.length > 0);
    if (hasGroup) coveredTypes++;
  }
  
  return coveredTypes / evidenceTypes.length;
}

/**
 * Execute fusion plan and combine evidence
 */
export async function executeFusionPlan(
  plan: FusionPlan,
  retrievedData: Map<SourceType, any[]>
): Promise<FusionResult> {
  const combinedEvidence: CombinedEvidence[] = [];
  const conflictsDetected: Conflict[] = [];
  
  // Group retrieved data by field
  const fieldData = new Map<string, { value: string; source: SourceType; confidence: number; evidenceType: EvidenceType }[]>();
  
  for (const group of plan.sourceGroups) {
    for (const source of group.sources) {
      const data = retrievedData.get(source);
      if (!data) continue;
      
      for (const item of data) {
        if (!item.field || !item.value) continue;
        
        const existing = fieldData.get(item.field) || [];
        existing.push({
          value: item.value,
          source,
          confidence: item.confidence || 0.7,
          evidenceType: group.evidenceType,
        });
        fieldData.set(item.field, existing);
      }
    }
  }
  
  // Process each field
  for (const [field, values] of Array.from(fieldData.entries())) {
    // Check for conflicts
    const uniqueValues = Array.from(new Set(values.map(v => normalizeValue(v.value))));
    
    if (uniqueValues.length > 1) {
      // Conflict detected - resolve it
      const conflict = resolveConflict(field, values);
      conflictsDetected.push(conflict);
      
      combinedEvidence.push({
        field,
        value: conflict.resolvedValue,
        sources: values.map(v => ({ source: v.source, confidence: v.confidence })),
        evidenceType: values[0].evidenceType,
        isVerified: true, // Verified through conflict resolution
      });
    } else {
      // No conflict - combine sources
      const avgConfidence = values.reduce((sum, v) => sum + v.confidence, 0) / values.length;
      
      combinedEvidence.push({
        field,
        value: values[0].value,
        sources: values.map(v => ({ source: v.source, confidence: v.confidence })),
        evidenceType: values[0].evidenceType,
        isVerified: values.length > 1, // Verified if from multiple sources
      });
    }
  }
  
  // Calculate coverage score
  const coveredEvidenceTypes = new Set(combinedEvidence.map(e => e.evidenceType));
  const coverageScore = coveredEvidenceTypes.size / plan.evidenceTypes.length;
  
  // Calculate confidence score
  const avgConfidence = combinedEvidence.length > 0
    ? combinedEvidence.reduce((sum, e) => {
        const sourceConfidences = e.sources.map(s => s.confidence);
        return sum + Math.max(...sourceConfidences);
      }, 0) / combinedEvidence.length
    : 0;
  
  return {
    combinedEvidence,
    coverageScore,
    conflictsDetected,
    confidenceScore: avgConfidence,
  };
}

/**
 * Resolve conflicts between sources
 */
function resolveConflict(
  field: string,
  values: { value: string; source: SourceType; confidence: number }[]
): Conflict {
  // Priority order for conflict resolution
  const sourcePriority: Record<SourceType, number> = {
    official_specs: 1,
    official_manuals: 2,
    comparison_sites: 3,
    retailer_data: 4,
    user_reviews: 5,
    forum_discussions: 6,
    video_content: 7,
  };
  
  // Sort by priority and confidence
  const sorted = values.sort((a, b) => {
    const priorityDiff = (sourcePriority[a.source] || 99) - (sourcePriority[b.source] || 99);
    if (priorityDiff !== 0) return priorityDiff;
    return b.confidence - a.confidence;
  });
  
  const resolvedValue = sorted[0].value;
  const resolution = `Resolved using ${sorted[0].source} (priority source with ${(sorted[0].confidence * 100).toFixed(0)}% confidence)`;
  
  return {
    field,
    values: values.map(v => ({ value: v.value, source: v.source })),
    resolution,
    resolvedValue,
  };
}

/**
 * Normalize values for comparison
 */
function normalizeValue(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[.,;:!?]+$/, '');
}

/**
 * Generate fusion report for debugging/logging
 */
export function generateFusionReport(
  plan: FusionPlan,
  result: FusionResult
): string {
  const lines: string[] = [
    '=== PROACTIVE FUSION REPORT ===',
    '',
    `Strategy: ${plan.strategy}`,
    `Evidence Types: ${plan.evidenceTypes.join(', ')}`,
    `Expected Coverage: ${(plan.expectedCoverage * 100).toFixed(0)}%`,
    `Actual Coverage: ${(result.coverageScore * 100).toFixed(0)}%`,
    `Confidence Score: ${(result.confidenceScore * 100).toFixed(0)}%`,
    '',
    '--- Source Groups ---',
  ];
  
  for (const group of plan.sourceGroups) {
    lines.push(`  ${group.evidenceType} (priority ${group.priority}${group.required ? ', required' : ''}):`);
    lines.push(`    Sources: ${group.sources.join(', ')}`);
    lines.push(`    Granularity: ${group.granularity}`);
  }
  
  lines.push('');
  lines.push('--- Combined Evidence ---');
  
  for (const evidence of result.combinedEvidence) {
    const sourceList = evidence.sources.map(s => `${s.source}(${(s.confidence * 100).toFixed(0)}%)`).join(', ');
    lines.push(`  ${evidence.field}: ${evidence.value.substring(0, 50)}...`);
    lines.push(`    Type: ${evidence.evidenceType}, Verified: ${evidence.isVerified}`);
    lines.push(`    Sources: ${sourceList}`);
  }
  
  if (result.conflictsDetected.length > 0) {
    lines.push('');
    lines.push('--- Conflicts Resolved ---');
    
    for (const conflict of result.conflictsDetected) {
      lines.push(`  ${conflict.field}:`);
      for (const v of conflict.values) {
        lines.push(`    - ${v.source}: ${v.value.substring(0, 30)}...`);
      }
      lines.push(`    Resolution: ${conflict.resolution}`);
    }
  }
  
  return lines.join('\n');
}

/**
 * Optimize fusion plan based on available resources
 */
export function optimizeFusionPlan(
  plan: FusionPlan,
  constraints: { maxSources: number; maxTokenBudget: number; timeoutMs: number }
): FusionPlan {
  const optimizedGroups: SourceGroup[] = [];
  let totalSources = 0;
  
  // Sort groups by priority
  const sortedGroups = [...plan.sourceGroups].sort((a, b) => a.priority - b.priority);
  
  for (const group of sortedGroups) {
    if (totalSources >= constraints.maxSources) break;
    
    const remainingSlots = constraints.maxSources - totalSources;
    const limitedSources = group.sources.slice(0, Math.min(group.sources.length, remainingSlots));
    
    if (limitedSources.length > 0 || group.required) {
      optimizedGroups.push({
        ...group,
        sources: limitedSources,
      });
      totalSources += limitedSources.length;
    }
  }
  
  return {
    ...plan,
    sourceGroups: optimizedGroups,
    expectedCoverage: calculateExpectedCoverage(optimizedGroups, plan.evidenceTypes),
    reasoning: `${plan.reasoning} [Optimized: max ${constraints.maxSources} sources]`,
  };
}
