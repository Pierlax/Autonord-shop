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

export interface ProvenanceNode {
  id: string;
  type: 'source' | 'extraction' | 'fusion' | 'generation' | 'verification';
  timestamp: Date;
  data: Record<string, unknown>;
  metadata: {
    confidence: number;
    model?: string;
    method?: string;
  };
}

export interface ProvenanceEdge {
  from: string;
  to: string;
  relationship: 'derived_from' | 'verified_by' | 'fused_with' | 'generated_from';
  weight: number;
}

export interface ProvenanceGraph {
  nodes: Map<string, ProvenanceNode>;
  edges: ProvenanceEdge[];
  rootNodes: string[];
  leafNodes: string[];
}

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
// Provenance Graph Builder
// ============================================================================

export class ProvenanceGraphBuilder {
  private graph: ProvenanceGraph;
  private nodeCounter: number = 0;

  constructor() {
    this.graph = {
      nodes: new Map(),
      edges: [],
      rootNodes: [],
      leafNodes: [],
    };
  }

  /**
   * Add a source node (root of provenance chain)
   */
  addSourceNode(
    sourceName: string,
    sourceType: string,
    data: Record<string, unknown>,
    reliability: number
  ): string {
    const id = `source_${++this.nodeCounter}`;
    
    this.graph.nodes.set(id, {
      id,
      type: 'source',
      timestamp: new Date(),
      data: {
        name: sourceName,
        sourceType,
        ...data,
      },
      metadata: {
        confidence: reliability * 100,
      },
    });
    
    this.graph.rootNodes.push(id);
    return id;
  }

  /**
   * Add an extraction node (data extracted from source)
   */
  addExtractionNode(
    sourceNodeId: string,
    extractedData: Record<string, unknown>,
    method: string,
    model?: string
  ): string {
    const id = `extraction_${++this.nodeCounter}`;
    
    this.graph.nodes.set(id, {
      id,
      type: 'extraction',
      timestamp: new Date(),
      data: extractedData,
      metadata: {
        confidence: 85,
        method,
        model,
      },
    });
    
    this.graph.edges.push({
      from: sourceNodeId,
      to: id,
      relationship: 'derived_from',
      weight: 1.0,
    });
    
    return id;
  }

  /**
   * Add a fusion node (multiple sources combined)
   */
  addFusionNode(
    inputNodeIds: string[],
    fusedData: Record<string, unknown>,
    confidence: number
  ): string {
    const id = `fusion_${++this.nodeCounter}`;
    
    this.graph.nodes.set(id, {
      id,
      type: 'fusion',
      timestamp: new Date(),
      data: fusedData,
      metadata: {
        confidence,
        method: 'weighted_source_fusion',
      },
    });
    
    for (const inputId of inputNodeIds) {
      this.graph.edges.push({
        from: inputId,
        to: id,
        relationship: 'fused_with',
        weight: 1.0 / inputNodeIds.length,
      });
    }
    
    return id;
  }

  /**
   * Add a generation node (AI-generated content)
   */
  addGenerationNode(
    inputNodeIds: string[],
    generatedContent: Record<string, unknown>,
    model: string,
    confidence: number
  ): string {
    const id = `generation_${++this.nodeCounter}`;
    
    this.graph.nodes.set(id, {
      id,
      type: 'generation',
      timestamp: new Date(),
      data: generatedContent,
      metadata: {
        confidence,
        model,
        method: 'llm_generation',
      },
    });
    
    for (const inputId of inputNodeIds) {
      this.graph.edges.push({
        from: inputId,
        to: id,
        relationship: 'generated_from',
        weight: 1.0,
      });
    }
    
    this.graph.leafNodes.push(id);
    return id;
  }

  /**
   * Add a verification node
   */
  addVerificationNode(
    targetNodeId: string,
    verificationResult: boolean,
    method: string
  ): string {
    const id = `verification_${++this.nodeCounter}`;
    
    this.graph.nodes.set(id, {
      id,
      type: 'verification',
      timestamp: new Date(),
      data: {
        result: verificationResult,
        targetNode: targetNodeId,
      },
      metadata: {
        confidence: verificationResult ? 95 : 50,
        method,
      },
    });
    
    this.graph.edges.push({
      from: targetNodeId,
      to: id,
      relationship: 'verified_by',
      weight: 1.0,
    });
    
    return id;
  }

  /**
   * Get the complete provenance graph
   */
  getGraph(): ProvenanceGraph {
    return this.graph;
  }

  /**
   * Trace provenance chain for a specific node
   */
  traceProvenance(nodeId: string): ProvenanceChainLink[] {
    const chain: ProvenanceChainLink[] = [];
    const visited = new Set<string>();
    
    const trace = (currentId: string, step: number) => {
      if (visited.has(currentId)) return;
      visited.add(currentId);
      
      const node = this.graph.nodes.get(currentId);
      if (!node) return;
      
      // Find parent edges
      const parentEdges = this.graph.edges.filter(e => e.to === currentId);
      
      for (const edge of parentEdges) {
        trace(edge.from, step + 1);
      }
      
      chain.push({
        step,
        operation: node.type,
        input: parentEdges.map(e => e.from).join(', ') || 'root',
        output: currentId,
        timestamp: node.timestamp,
        model: node.metadata.model,
      });
    };
    
    trace(nodeId, 0);
    return chain.sort((a, b) => b.step - a.step);
  }
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

/**
 * Generate detailed provenance report
 */
export function generateProvenanceReport(provenance: ContentProvenance): string {
  const lines: string[] = [
    '=== PROVENANCE REPORT ===',
    '',
    `Product: ${provenance.productName}`,
    `Generated: ${provenance.generatedAt.toISOString()}`,
    `Overall Confidence: ${provenance.overallConfidence}%`,
    '',
    '## Source Breakdown',
    `- Official sources: ${provenance.sourceBreakdown.official}`,
    `- Retailer sources: ${provenance.sourceBreakdown.retailer}`,
    `- Review sources: ${provenance.sourceBreakdown.review}`,
    `- Generated content: ${provenance.sourceBreakdown.generated}`,
    '',
  ];
  
  if (provenance.warnings.length > 0) {
    lines.push('## Warnings');
    for (const warning of provenance.warnings) {
      lines.push(`⚠️ ${warning}`);
    }
    lines.push('');
  }
  
  lines.push('## Fact Provenance');
  for (const fact of provenance.facts) {
    lines.push(`\n### ${fact.factKey}`);
    lines.push(`Value: ${fact.factValue}`);
    lines.push(`Confidence: ${fact.confidence}%`);
    lines.push(`Status: ${fact.verificationStatus}`);
    lines.push(`Primary Source: ${fact.primarySource.name} (${fact.primarySource.type})`);
    
    if (fact.supportingSources.length > 0) {
      lines.push(`Supporting Sources: ${fact.supportingSources.map(s => s.name).join(', ')}`);
    }
    
    lines.push('\nProvenance Chain:');
    for (const link of fact.chain) {
      lines.push(`  ${link.step}. ${link.operation}: ${link.input} → ${link.output}`);
    }
  }
  
  return lines.join('\n');
}
