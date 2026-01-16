/**
 * Business Impact Metrics Module
 * 
 * Implements business impact measurement as recommended by the RAG Enterprise paper
 * (only 15.6% of studies measure business impact).
 * 
 * Key metrics:
 * - Time saved in content generation
 * - Error rate in product specs
 * - User satisfaction signals
 * - Content quality scores
 * - Operational efficiency
 */

import { loggers } from '@/lib/logger';

const log = loggers.shopify;

// ============================================================================
// Types
// ============================================================================

export interface ContentGenerationMetrics {
  productId: string;
  productName: string;
  timestamp: Date;
  
  // Time metrics
  totalGenerationTimeMs: number;
  researchTimeMs: number;
  fusionTimeMs: number;
  llmGenerationTimeMs: number;
  verificationTimeMs: number;
  
  // Quality metrics
  overallConfidence: number;
  sourcesUsed: number;
  conflictsDetected: number;
  conflictsResolved: number;
  manualChecksRequired: number;
  
  // Content metrics
  descriptionWordCount: number;
  prosCount: number;
  consCount: number;
  faqsCount: number;
  accessoriesCount: number;
  
  // Provenance metrics
  officialSourcesPercent: number;
  verifiedFactsPercent: number;
}

export interface ErrorMetrics {
  productId: string;
  errorType: ErrorType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  timestamp: Date;
  details: string;
  resolved: boolean;
  resolutionTimeMs?: number;
}

export type ErrorType =
  | 'spec_mismatch'
  | 'hallucination_detected'
  | 'source_conflict'
  | 'generation_failure'
  | 'verification_failure'
  | 'manual_correction';

export interface UserFeedbackMetrics {
  productId: string;
  feedbackType: FeedbackType;
  timestamp: Date;
  details?: string;
  rating?: number;
}

export type FeedbackType =
  | 'content_helpful'
  | 'content_inaccurate'
  | 'missing_info'
  | 'too_verbose'
  | 'too_brief'
  | 'manual_edit'
  | 'approved_as_is';

export interface AggregatedMetrics {
  period: string;
  startDate: Date;
  endDate: Date;
  
  // Volume
  totalProductsProcessed: number;
  successfulGenerations: number;
  failedGenerations: number;
  
  // Time savings
  averageGenerationTimeMs: number;
  estimatedManualTimeMs: number;
  timeSavedMs: number;
  timeSavedPercent: number;
  
  // Quality
  averageConfidence: number;
  averageSourcesUsed: number;
  totalConflictsDetected: number;
  conflictResolutionRate: number;
  
  // Errors
  totalErrors: number;
  errorsByType: Record<ErrorType, number>;
  errorRate: number;
  
  // User satisfaction
  totalFeedback: number;
  positiveFeedbackRate: number;
  manualEditRate: number;
  approvalRate: number;
}

export interface BusinessImpactReport {
  reportDate: Date;
  reportPeriod: string;
  
  // Executive summary
  summary: {
    productsEnriched: number;
    timeSavedHours: number;
    costSavingsEstimate: number;
    qualityScore: number;
    errorRate: number;
  };
  
  // Detailed metrics
  generationMetrics: AggregatedMetrics;
  
  // Trends
  trends: {
    metric: string;
    direction: 'up' | 'down' | 'stable';
    changePercent: number;
  }[];
  
  // Recommendations
  recommendations: string[];
}

// ============================================================================
// Metrics Storage (In-memory for now, can be persisted to DB)
// ============================================================================

class MetricsStore {
  private generationMetrics: ContentGenerationMetrics[] = [];
  private errorMetrics: ErrorMetrics[] = [];
  private feedbackMetrics: UserFeedbackMetrics[] = [];

  // ============================================================================
  // Recording Methods
  // ============================================================================

  recordGeneration(metrics: ContentGenerationMetrics): void {
    this.generationMetrics.push(metrics);
    log.info(`[BusinessMetrics] Recorded generation for ${metrics.productName}`);
  }

  recordError(metrics: ErrorMetrics): void {
    this.errorMetrics.push(metrics);
    log.info(`[BusinessMetrics] Recorded ${metrics.errorType} error for ${metrics.productId}`);
  }

  recordFeedback(metrics: UserFeedbackMetrics): void {
    this.feedbackMetrics.push(metrics);
    log.info(`[BusinessMetrics] Recorded ${metrics.feedbackType} feedback for ${metrics.productId}`);
  }

  // ============================================================================
  // Query Methods
  // ============================================================================

  getGenerationMetrics(
    startDate?: Date,
    endDate?: Date
  ): ContentGenerationMetrics[] {
    let metrics = this.generationMetrics;
    
    if (startDate) {
      metrics = metrics.filter(m => m.timestamp >= startDate);
    }
    if (endDate) {
      metrics = metrics.filter(m => m.timestamp <= endDate);
    }
    
    return metrics;
  }

  getErrorMetrics(
    startDate?: Date,
    endDate?: Date
  ): ErrorMetrics[] {
    let metrics = this.errorMetrics;
    
    if (startDate) {
      metrics = metrics.filter(m => m.timestamp >= startDate);
    }
    if (endDate) {
      metrics = metrics.filter(m => m.timestamp <= endDate);
    }
    
    return metrics;
  }

  getFeedbackMetrics(
    startDate?: Date,
    endDate?: Date
  ): UserFeedbackMetrics[] {
    let metrics = this.feedbackMetrics;
    
    if (startDate) {
      metrics = metrics.filter(m => m.timestamp >= startDate);
    }
    if (endDate) {
      metrics = metrics.filter(m => m.timestamp <= endDate);
    }
    
    return metrics;
  }

  // ============================================================================
  // Aggregation Methods
  // ============================================================================

  aggregateMetrics(
    startDate: Date,
    endDate: Date,
    periodLabel: string
  ): AggregatedMetrics {
    const generations = this.getGenerationMetrics(startDate, endDate);
    const errors = this.getErrorMetrics(startDate, endDate);
    const feedback = this.getFeedbackMetrics(startDate, endDate);

    // Volume metrics
    const totalProductsProcessed = generations.length;
    const successfulGenerations = generations.filter(g => g.overallConfidence >= 60).length;
    const failedGenerations = totalProductsProcessed - successfulGenerations;

    // Time metrics
    const totalGenerationTime = generations.reduce((sum, g) => sum + g.totalGenerationTimeMs, 0);
    const averageGenerationTimeMs = totalProductsProcessed > 0 
      ? totalGenerationTime / totalProductsProcessed 
      : 0;
    
    // Estimate manual time: 30 minutes per product for research + writing
    const estimatedManualTimeMs = totalProductsProcessed * 30 * 60 * 1000;
    const timeSavedMs = estimatedManualTimeMs - totalGenerationTime;
    const timeSavedPercent = estimatedManualTimeMs > 0 
      ? (timeSavedMs / estimatedManualTimeMs) * 100 
      : 0;

    // Quality metrics
    const averageConfidence = totalProductsProcessed > 0
      ? generations.reduce((sum, g) => sum + g.overallConfidence, 0) / totalProductsProcessed
      : 0;
    const averageSourcesUsed = totalProductsProcessed > 0
      ? generations.reduce((sum, g) => sum + g.sourcesUsed, 0) / totalProductsProcessed
      : 0;
    const totalConflictsDetected = generations.reduce((sum, g) => sum + g.conflictsDetected, 0);
    const totalConflictsResolved = generations.reduce((sum, g) => sum + g.conflictsResolved, 0);
    const conflictResolutionRate = totalConflictsDetected > 0
      ? (totalConflictsResolved / totalConflictsDetected) * 100
      : 100;

    // Error metrics
    const totalErrors = errors.length;
    const errorsByType: Record<ErrorType, number> = {
      spec_mismatch: 0,
      hallucination_detected: 0,
      source_conflict: 0,
      generation_failure: 0,
      verification_failure: 0,
      manual_correction: 0,
    };
    for (const error of errors) {
      errorsByType[error.errorType]++;
    }
    const errorRate = totalProductsProcessed > 0
      ? (totalErrors / totalProductsProcessed) * 100
      : 0;

    // Feedback metrics
    const totalFeedback = feedback.length;
    const positiveFeedback = feedback.filter(f => 
      f.feedbackType === 'content_helpful' || f.feedbackType === 'approved_as_is'
    ).length;
    const positiveFeedbackRate = totalFeedback > 0
      ? (positiveFeedback / totalFeedback) * 100
      : 0;
    const manualEdits = feedback.filter(f => f.feedbackType === 'manual_edit').length;
    const manualEditRate = totalProductsProcessed > 0
      ? (manualEdits / totalProductsProcessed) * 100
      : 0;
    const approvals = feedback.filter(f => f.feedbackType === 'approved_as_is').length;
    const approvalRate = totalProductsProcessed > 0
      ? (approvals / totalProductsProcessed) * 100
      : 0;

    return {
      period: periodLabel,
      startDate,
      endDate,
      totalProductsProcessed,
      successfulGenerations,
      failedGenerations,
      averageGenerationTimeMs,
      estimatedManualTimeMs,
      timeSavedMs,
      timeSavedPercent,
      averageConfidence,
      averageSourcesUsed,
      totalConflictsDetected,
      conflictResolutionRate,
      totalErrors,
      errorsByType,
      errorRate,
      totalFeedback,
      positiveFeedbackRate,
      manualEditRate,
      approvalRate,
    };
  }

  // ============================================================================
  // Report Generation
  // ============================================================================

  generateBusinessImpactReport(
    startDate: Date,
    endDate: Date,
    periodLabel: string
  ): BusinessImpactReport {
    const metrics = this.aggregateMetrics(startDate, endDate, periodLabel);
    
    // Calculate cost savings (assuming €25/hour for manual content creation)
    const hourlyRate = 25;
    const timeSavedHours = metrics.timeSavedMs / (1000 * 60 * 60);
    const costSavingsEstimate = timeSavedHours * hourlyRate;
    
    // Calculate quality score (weighted average)
    const qualityScore = (
      metrics.averageConfidence * 0.4 +
      metrics.conflictResolutionRate * 0.2 +
      (100 - metrics.errorRate) * 0.2 +
      metrics.positiveFeedbackRate * 0.2
    );

    // Generate recommendations
    const recommendations: string[] = [];
    
    if (metrics.errorRate > 10) {
      recommendations.push('Error rate is high. Review source quality and verification processes.');
    }
    if (metrics.averageConfidence < 70) {
      recommendations.push('Average confidence is low. Consider adding more official sources.');
    }
    if (metrics.manualEditRate > 30) {
      recommendations.push('High manual edit rate. Review generation prompts and source selection.');
    }
    if (metrics.conflictResolutionRate < 80) {
      recommendations.push('Conflict resolution rate is low. Improve source hierarchy rules.');
    }
    if (metrics.timeSavedPercent < 50) {
      recommendations.push('Time savings below target. Optimize generation pipeline.');
    }

    // Calculate trends (would need historical data for real trends)
    const trends = [
      {
        metric: 'Quality Score',
        direction: qualityScore >= 75 ? 'up' : 'stable' as 'up' | 'down' | 'stable',
        changePercent: 0,
      },
      {
        metric: 'Error Rate',
        direction: metrics.errorRate <= 5 ? 'down' : 'stable' as 'up' | 'down' | 'stable',
        changePercent: 0,
      },
    ];

    return {
      reportDate: new Date(),
      reportPeriod: periodLabel,
      summary: {
        productsEnriched: metrics.totalProductsProcessed,
        timeSavedHours: Math.round(timeSavedHours * 10) / 10,
        costSavingsEstimate: Math.round(costSavingsEstimate),
        qualityScore: Math.round(qualityScore),
        errorRate: Math.round(metrics.errorRate * 10) / 10,
      },
      generationMetrics: metrics,
      trends,
      recommendations,
    };
  }

  // ============================================================================
  // Export Methods
  // ============================================================================

  exportToJSON(): string {
    return JSON.stringify({
      generationMetrics: this.generationMetrics,
      errorMetrics: this.errorMetrics,
      feedbackMetrics: this.feedbackMetrics,
      exportedAt: new Date().toISOString(),
    }, null, 2);
  }

  clear(): void {
    this.generationMetrics = [];
    this.errorMetrics = [];
    this.feedbackMetrics = [];
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let metricsStoreInstance: MetricsStore | null = null;

export function getMetricsStore(): MetricsStore {
  if (!metricsStoreInstance) {
    metricsStoreInstance = new MetricsStore();
  }
  return metricsStoreInstance;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create generation metrics from enrichment result
 */
export function createGenerationMetrics(
  productId: string,
  productName: string,
  timings: {
    total: number;
    research: number;
    fusion: number;
    llm: number;
    verification: number;
  },
  quality: {
    confidence: number;
    sources: number;
    conflicts: number;
    resolved: number;
    manualChecks: number;
  },
  content: {
    descriptionWords: number;
    pros: number;
    cons: number;
    faqs: number;
    accessories: number;
  },
  provenance: {
    officialPercent: number;
    verifiedPercent: number;
  }
): ContentGenerationMetrics {
  return {
    productId,
    productName,
    timestamp: new Date(),
    totalGenerationTimeMs: timings.total,
    researchTimeMs: timings.research,
    fusionTimeMs: timings.fusion,
    llmGenerationTimeMs: timings.llm,
    verificationTimeMs: timings.verification,
    overallConfidence: quality.confidence,
    sourcesUsed: quality.sources,
    conflictsDetected: quality.conflicts,
    conflictsResolved: quality.resolved,
    manualChecksRequired: quality.manualChecks,
    descriptionWordCount: content.descriptionWords,
    prosCount: content.pros,
    consCount: content.cons,
    faqsCount: content.faqs,
    accessoriesCount: content.accessories,
    officialSourcesPercent: provenance.officialPercent,
    verifiedFactsPercent: provenance.verifiedPercent,
  };
}

/**
 * Format business impact report as text
 */
export function formatBusinessImpactReport(report: BusinessImpactReport): string {
  const lines: string[] = [
    '═══════════════════════════════════════════════════════════════',
    '              BUSINESS IMPACT REPORT',
    `              ${report.reportPeriod}`,
    '═══════════════════════════════════════════════════════════════',
    '',
    '📊 EXECUTIVE SUMMARY',
    '───────────────────────────────────────────────────────────────',
    `  Products Enriched:     ${report.summary.productsEnriched}`,
    `  Time Saved:            ${report.summary.timeSavedHours} hours`,
    `  Cost Savings:          €${report.summary.costSavingsEstimate}`,
    `  Quality Score:         ${report.summary.qualityScore}/100`,
    `  Error Rate:            ${report.summary.errorRate}%`,
    '',
    '⏱️ EFFICIENCY METRICS',
    '───────────────────────────────────────────────────────────────',
    `  Avg Generation Time:   ${Math.round(report.generationMetrics.averageGenerationTimeMs / 1000)}s`,
    `  Est. Manual Time:      ${Math.round(report.generationMetrics.estimatedManualTimeMs / 60000)} min/product`,
    `  Time Saved:            ${Math.round(report.generationMetrics.timeSavedPercent)}%`,
    '',
    '✅ QUALITY METRICS',
    '───────────────────────────────────────────────────────────────',
    `  Average Confidence:    ${Math.round(report.generationMetrics.averageConfidence)}%`,
    `  Avg Sources Used:      ${report.generationMetrics.averageSourcesUsed.toFixed(1)}`,
    `  Conflicts Detected:    ${report.generationMetrics.totalConflictsDetected}`,
    `  Resolution Rate:       ${Math.round(report.generationMetrics.conflictResolutionRate)}%`,
    '',
    '❌ ERROR METRICS',
    '───────────────────────────────────────────────────────────────',
    `  Total Errors:          ${report.generationMetrics.totalErrors}`,
    `  Error Rate:            ${report.generationMetrics.errorRate.toFixed(1)}%`,
  ];

  // Add error breakdown
  const errorsByType = report.generationMetrics.errorsByType;
  for (const [type, count] of Object.entries(errorsByType)) {
    if (count > 0) {
      lines.push(`    - ${type}: ${count}`);
    }
  }

  lines.push('');
  lines.push('👥 USER FEEDBACK');
  lines.push('───────────────────────────────────────────────────────────────');
  lines.push(`  Total Feedback:        ${report.generationMetrics.totalFeedback}`);
  lines.push(`  Positive Rate:         ${Math.round(report.generationMetrics.positiveFeedbackRate)}%`);
  lines.push(`  Manual Edit Rate:      ${Math.round(report.generationMetrics.manualEditRate)}%`);
  lines.push(`  Approval Rate:         ${Math.round(report.generationMetrics.approvalRate)}%`);

  if (report.recommendations.length > 0) {
    lines.push('');
    lines.push('💡 RECOMMENDATIONS');
    lines.push('───────────────────────────────────────────────────────────────');
    for (const rec of report.recommendations) {
      lines.push(`  • ${rec}`);
    }
  }

  lines.push('');
  lines.push('═══════════════════════════════════════════════════════════════');
  lines.push(`  Report Generated: ${report.reportDate.toISOString()}`);
  lines.push('═══════════════════════════════════════════════════════════════');

  return lines.join('\n');
}
