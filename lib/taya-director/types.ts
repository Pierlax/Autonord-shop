/**
 * TAYA Director - Type Definitions
 * 
 * Central types for the orchestration system that coordinates
 * all AI agents (Product Enrichment, Blog Researcher, Code Improver)
 */

// ============================================
// Quality Scoring
// ============================================

export interface QualityScore {
  /** 0-100: Does content follow TAYA principles? (honesty, clarity, no fluff) */
  tayaCompliance: number;
  
  /** 0-100: Is the text easy to read? (sentence length, vocabulary) */
  readability: number;
  
  /** 0-100: Is content unique and not generic/templated? */
  uniqueness: number;
  
  /** 0-100: Does it help the customer make a decision? */
  actionability: number;
  
  /** Overall weighted score */
  overall: number;
}

export interface QualityEvaluation {
  productId: string;
  productHandle: string;
  score: QualityScore;
  passed: boolean;
  issues: QualityIssue[];
  evaluatedAt: string;
}

export interface QualityIssue {
  type: 'taya_violation' | 'readability' | 'generic_content' | 'missing_info';
  severity: 'low' | 'medium' | 'high';
  description: string;
  suggestion: string;
}

// ============================================
// Editorial Planning
// ============================================

export interface ContentGap {
  type: 'product_category' | 'brand' | 'use_case' | 'comparison' | 'problem';
  identifier: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  suggestedArticleTitle: string;
  suggestedArticleType: 'review' | 'comparison' | 'guide' | 'problem_solution' | 'pricing';
  productCount?: number;
  estimatedTraffic?: number;
}

export interface EditorialPlan {
  generatedAt: string;
  gaps: ContentGap[];
  nextArticleToWrite: ContentGap | null;
  productsNeedingEnrichment: string[];
  productsNeedingReEnrichment: string[];
}

// ============================================
// Director Decisions
// ============================================

export type DirectorAction = 
  | { type: 'enrich_product'; productId: string; reason: string }
  | { type: 're_enrich_product'; productId: string; reason: string; previousScore: number }
  | { type: 'commission_article'; gap: ContentGap }
  | { type: 'improve_code'; target: string; improvement: string }
  | { type: 'no_action'; reason: string };

export interface DirectorDecision {
  id: string;
  timestamp: string;
  action: DirectorAction;
  priority: number;
  estimatedImpact: 'low' | 'medium' | 'high';
  status: 'pending' | 'queued' | 'completed' | 'failed';
  qstashMessageId?: string;
}

export interface DirectorSession {
  sessionId: string;
  startedAt: string;
  completedAt?: string;
  productsEvaluated: number;
  productsPassed: number;
  productsFailed: number;
  articlesCommissioned: number;
  codeImprovementsQueued: number;
  decisions: DirectorDecision[];
  errors: DirectorError[];
}

export interface DirectorError {
  timestamp: string;
  phase: 'supervisor' | 'strategist' | 'orchestrator';
  message: string;
  context?: Record<string, unknown>;
}

// ============================================
// Rate Limiting
// ============================================

export interface RateLimits {
  /** Max products to re-process per day */
  maxProductReEnrichmentsPerDay: number;
  
  /** Max articles to commission per week */
  maxArticlesPerWeek: number;
  
  /** Max GitHub PRs per week */
  maxCodeImprovementsPerWeek: number;
  
  /** Minimum hours between Director runs */
  minHoursBetweenRuns: number;
}

export const DEFAULT_RATE_LIMITS: RateLimits = {
  maxProductReEnrichmentsPerDay: 10,
  maxArticlesPerWeek: 2,
  maxCodeImprovementsPerWeek: 1,
  minHoursBetweenRuns: 20,
};

// ============================================
// Configuration
// ============================================

export interface DirectorConfig {
  /** Minimum overall score to pass quality check */
  minQualityScore: number;
  
  /** Weights for quality scoring */
  scoreWeights: {
    tayaCompliance: number;
    readability: number;
    uniqueness: number;
    actionability: number;
  };
  
  /** Rate limits */
  rateLimits: RateLimits;
  
  /** Enable/disable specific modules */
  modules: {
    supervisor: boolean;
    strategist: boolean;
    codeImprover: boolean;
  };
}

export const DEFAULT_CONFIG: DirectorConfig = {
  minQualityScore: 70,
  scoreWeights: {
    tayaCompliance: 0.35,
    readability: 0.20,
    uniqueness: 0.25,
    actionability: 0.20,
  },
  minQualityScore: 70,
  rateLimits: DEFAULT_RATE_LIMITS,
  modules: {
    supervisor: true,
    strategist: true,
    codeImprover: false, // Disabled by default, run manually
  },
};

// ============================================
// Shopify Product (simplified for Director)
// ============================================

export interface DirectorProduct {
  id: string;
  handle: string;
  title: string;
  productType: string;
  vendor: string;
  tags: string[];
  bodyHtml: string;
  hasAiEnhanced: boolean;
  metafields: {
    pros?: string[];
    cons?: string[];
    faqs?: string;
    aiDescription?: string;
  };
  updatedAt: string;
}

// ============================================
// Blog Article (simplified for Director)
// ============================================

export interface DirectorArticle {
  id: string;
  handle: string;
  title: string;
  category: string;
  publishedAt: string | null;
  tags: string[];
}
