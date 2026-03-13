/**
 * Provenance Tracking Module
 * 
 * Implements provenance graphs for hallucination control as recommended
 * by the RAG Enterprise paper (48.1% of studies cite hallucination as top challenge).
 * 
 * Key features:
 * - Track source attribution through entire generation pipeline
 * - Generate provenance chains for each fact
 * - Display source transparency in product descriptions
 * - Enable audit trails for content verification
 */

// ============================================================================
// Types
// ============================================================================

export interface FactProvenance {
  factId: string;
  factKey: string;
  factValue: string;
  confidence: number;
  chain: ProvenanceChainLink[];
  primarySource: SourceAttribution;
  supportingSources: SourceAttribution[];
  verificationStatus: 'verified' | 'unverified' | 'conflicting';
  auditTrail: AuditEntry[];
}

export interface ProvenanceChainLink {
  step: number;
  operation: string;
  input: string;
  output: string;
  timestamp: Date;
  model?: string;
}

export interface SourceAttribution {
  name: string;
  type: 'official' | 'manual' | 'retailer' | 'review' | 'forum' | 'generated';
  url?: string;
  reliability: number;
  extractedAt: Date;
  rawData?: string;
}

export interface AuditEntry {
  timestamp: Date;
  action: string;
  actor: string;
  details: string;
}

export interface ContentProvenance {
  productId: string;
  productName: string;
  generatedAt: Date;
  facts: FactProvenance[];
  overallConfidence: number;
  sourceBreakdown: {
    official: number;
    retailer: number;
    review: number;
    generated: number;
  };
  warnings: string[];
}

// ============================================================================
// Fact Provenance Tracker
// ============================================================================

export class FactProvenanceTracker {
  private facts: Map<string, FactProvenance> = new Map();
  private auditLog: AuditEntry[] = [];

  /**
   * Register a new fact with its provenance
   */
  registerFact(
    factKey: string,
    factValue: string,
    primarySource: SourceAttribution,
    supportingSources: SourceAttribution[] = []
  ): string {
    const factId = `fact_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Calculate confidence based on sources
    const confidence = this.calculateFactConfidence(primarySource, supportingSources);
    
    // Determine verification status
    const verificationStatus = this.determineVerificationStatus(
      primarySource,
      supportingSources
    );
    
    const provenance: FactProvenance = {
      factId,
      factKey,
      factValue,
      confidence,
      chain: [{
        step: 0,
        operation: 'extraction',
        input: primarySource.name,
        output: factValue,
        timestamp: new Date(),
      }],
      primarySource,
      supportingSources,
      verificationStatus,
      auditTrail: [{
        timestamp: new Date(),
        action: 'fact_registered',
        actor: 'system',
        details: `Fact "${factKey}" registered from ${primarySource.name}`,
      }],
    };
    
    this.facts.set(factId, provenance);
    this.logAudit('fact_registered', `Registered fact: ${factKey} = ${factValue}`);
    
    return factId;
  }

  /**
   * Update fact provenance after fusion
   */
  updateAfterFusion(
    factId: string,
    fusedValue: string,
    fusedConfidence: number,
    fusionSources: SourceAttribution[]
  ): void {
    const fact = this.facts.get(factId);
    if (!fact) return;
    
    fact.factValue = fusedValue;
    fact.confidence = fusedConfidence;
    fact.supportingSources = fusionSources;
    
    fact.chain.push({
      step: fact.chain.length,
      operation: 'fusion',
      input: fusionSources.map(s => s.name).join(', '),
      output: fusedValue,
      timestamp: new Date(),
    });
    
    fact.auditTrail.push({
      timestamp: new Date(),
      action: 'fact_fused',
      actor: 'source_fusion',
      details: `Fused from ${fusionSources.length} sources, confidence: ${fusedConfidence}%`,
    });
  }

  /**
   * Update fact provenance after generation
   */
  updateAfterGeneration(
    factId: string,
    generatedContent: string,
    model: string
  ): void {
    const fact = this.facts.get(factId);
    if (!fact) return;
    
    fact.chain.push({
      step: fact.chain.length,
      operation: 'generation',
      input: fact.factValue,
      output: generatedContent,
      timestamp: new Date(),
      model,
    });
    
    fact.auditTrail.push({
      timestamp: new Date(),
      action: 'content_generated',
      actor: model,
      details: `Generated content using ${model}`,
    });
  }

  /**
   * Mark fact as verified
   */
  verifyFact(factId: string, verificationMethod: string): void {
    const fact = this.facts.get(factId);
    if (!fact) return;
    
    fact.verificationStatus = 'verified';
    fact.confidence = Math.min(100, fact.confidence + 10);
    
    fact.chain.push({
      step: fact.chain.length,
      operation: 'verification',
      input: fact.factValue,
      output: 'verified',
      timestamp: new Date(),
    });
    
    fact.auditTrail.push({
      timestamp: new Date(),
      action: 'fact_verified',
      actor: verificationMethod,
      details: `Verified using ${verificationMethod}`,
    });
  }

  /**
   * Get fact provenance
   */
  getFactProvenance(factId: string): FactProvenance | undefined {
    return this.facts.get(factId);
  }

  /**
   * Get all facts
   */
  getAllFacts(): FactProvenance[] {
    return Array.from(this.facts.values());
  }

  /**
   * Calculate confidence based on sources
   */
  private calculateFactConfidence(
    primary: SourceAttribution,
    supporting: SourceAttribution[]
  ): number {
    let confidence = primary.reliability * 100;
    
    // Bonus for supporting sources
    for (const source of supporting) {
      confidence += source.reliability * 5;
    }
    
    // Cap at 100
    return Math.min(100, Math.round(confidence));
  }

  /**
   * Determine verification status
   */
  private determineVerificationStatus(
    primary: SourceAttribution,
    supporting: SourceAttribution[]
  ): 'verified' | 'unverified' | 'conflicting' {
    if (primary.type === 'official' || primary.type === 'manual') {
      return 'verified';
    }
    
    if (supporting.length >= 2) {
      return 'verified';
    }
    
    return 'unverified';
  }

  /**
   * Log audit entry
   */
  private logAudit(action: string, details: string): void {
    this.auditLog.push({
      timestamp: new Date(),
      action,
      actor: 'provenance_tracker',
      details,
    });
  }
}

// ============================================================================
// Content Provenance Generator
// ============================================================================

/**
 * Generate complete provenance report for product content
 */
export function generateContentProvenance(
  productId: string,
  productName: string,
  facts: FactProvenance[]
): ContentProvenance {
  // Calculate source breakdown
  const sourceBreakdown = {
    official: 0,
    retailer: 0,
    review: 0,
    generated: 0,
  };
  
  for (const fact of facts) {
    switch (fact.primarySource.type) {
      case 'official':
      case 'manual':
        sourceBreakdown.official++;
        break;
      case 'retailer':
        sourceBreakdown.retailer++;
        break;
      case 'review':
      case 'forum':
        sourceBreakdown.review++;
        break;
      case 'generated':
        sourceBreakdown.generated++;
        break;
    }
  }
  
  // Calculate overall confidence
  const overallConfidence = facts.length > 0
    ? Math.round(facts.reduce((sum, f) => sum + f.confidence, 0) / facts.length)
    : 0;
  
  // Generate warnings
  const warnings: string[] = [];
  
  const unverifiedCount = facts.filter(f => f.verificationStatus === 'unverified').length;
  if (unverifiedCount > 0) {
    warnings.push(`${unverifiedCount} facts are unverified`);
  }
  
  const lowConfidenceCount = facts.filter(f => f.confidence < 70).length;
  if (lowConfidenceCount > 0) {
    warnings.push(`${lowConfidenceCount} facts have low confidence (<70%)`);
  }
  
  if (sourceBreakdown.generated > sourceBreakdown.official) {
    warnings.push('More generated content than official sources');
  }
  
  return {
    productId,
    productName,
    generatedAt: new Date(),
    facts,
    overallConfidence,
    sourceBreakdown,
    warnings,
  };
}

// ============================================================================
// Display Helpers
// ============================================================================

/**
 * Format provenance for display in product description
 */
export function formatProvenanceDisplay(provenance: ContentProvenance): string {
  const { overallConfidence, sourceBreakdown, warnings } = provenance;
  
  // Confidence badge
  let confidenceBadge: string;
  if (overallConfidence >= 90) {
    confidenceBadge = '🟢 Alta affidabilità';
  } else if (overallConfidence >= 70) {
    confidenceBadge = '🟡 Buona affidabilità';
  } else {
    confidenceBadge = '🟠 Da verificare';
  }
  
  // Source breakdown
  const total = Object.values(sourceBreakdown).reduce((a, b) => a + b, 0);
  const officialPercent = total > 0 ? Math.round((sourceBreakdown.official / total) * 100) : 0;
  
  return `
<div class="provenance-info">
  <span class="confidence-badge">${confidenceBadge} (${overallConfidence}%)</span>
  <span class="source-info">Fonti: ${officialPercent}% ufficiali</span>
  ${warnings.length > 0 ? `<span class="provenance-warning">⚠️ ${warnings[0]}</span>` : ''}
</div>`.trim();
}

