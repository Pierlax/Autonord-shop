/**
 * Quality Control Module
 * Validates AI-generated content to ensure human-like quality
 * 
 * Checks for:
 * - Robotic patterns and phrases
 * - Proper structure and length
 * - Italian language quality
 * - TAYA methodology compliance
 */

export interface QualityReport {
  score: number; // 0-100
  passed: boolean;
  issues: QualityIssue[];
  suggestions: string[];
}

export interface QualityIssue {
  type: 'critical' | 'warning' | 'info';
  message: string;
  location?: string;
}

// Patterns that indicate robotic/AI-generated content
const ROBOTIC_PATTERNS = [
  // Italian robotic starts
  /^questo prodotto/i,
  /^il presente articolo/i,
  /^in questo articolo/i,
  /^l'obiettivo di questo/i,
  /^benvenuti in questa guida/i,
  
  // Generic filler phrases
  /è importante notare che/gi,
  /è fondamentale sottolineare/gi,
  /non si può negare che/gi,
  /in conclusione,? possiamo affermare/gi,
  /come abbiamo visto/gi,
  
  // Excessive superlatives
  /assolutamente eccezionale/gi,
  /straordinariamente/gi,
  /incredibilmente innovativo/gi,
  /rivoluzionario/gi,
  /leader indiscusso/gi,
  /il migliore in assoluto/gi,
  
  // Corporate speak
  /sinergia/gi,
  /ottimizzare le performance/gi,
  /massimizzare l'efficienza/gi,
  /a 360 gradi/gi,
  /best practice/gi,
  /win-win/gi,
];

// Phrases that indicate good, human-like content
const HUMAN_PATTERNS = [
  /secondo me/i,
  /nella mia esperienza/i,
  /devo ammettere/i,
  /onestamente/i,
  /il problema è che/i,
  /la verità è/i,
  /parliamoci chiaro/i,
  /facciamo un passo indietro/i,
];

// Required elements for TAYA content
const TAYA_REQUIREMENTS = {
  minWordCount: 150,
  maxWordCount: 3000,
  minParagraphs: 3,
  minSections: 2,
  requiresProsAndCons: true,
};

/**
 * Check for robotic patterns in text
 */
function checkRoboticPatterns(text: string): QualityIssue[] {
  const issues: QualityIssue[] = [];
  
  for (const pattern of ROBOTIC_PATTERNS) {
    const matches = text.match(pattern);
    if (matches) {
      issues.push({
        type: 'warning',
        message: `Robotic pattern detected: "${matches[0]}"`,
        location: `Found ${matches.length} occurrence(s)`,
      });
    }
  }
  
  return issues;
}

/**
 * Check for human-like elements
 */
function checkHumanElements(text: string): { found: string[]; missing: boolean } {
  const found: string[] = [];
  
  for (const pattern of HUMAN_PATTERNS) {
    if (pattern.test(text)) {
      const match = text.match(pattern);
      if (match) found.push(match[0]);
    }
  }
  
  return {
    found,
    missing: found.length === 0,
  };
}

/**
 * Check content structure
 */
function checkStructure(html: string): QualityIssue[] {
  const issues: QualityIssue[] = [];
  
  // Count elements
  const h2Count = (html.match(/<h2/g) || []).length;
  const h3Count = (html.match(/<h3/g) || []).length;
  const pCount = (html.match(/<p>/g) || []).length;
  const ulCount = (html.match(/<ul>/g) || []).length;
  
  // Strip HTML for word count
  const textOnly = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  const wordCount = textOnly.split(' ').length;
  
  // Check word count
  if (wordCount < TAYA_REQUIREMENTS.minWordCount) {
    issues.push({
      type: 'critical',
      message: `Content too short: ${wordCount} words (minimum: ${TAYA_REQUIREMENTS.minWordCount})`,
    });
  }
  
  if (wordCount > TAYA_REQUIREMENTS.maxWordCount) {
    issues.push({
      type: 'warning',
      message: `Content may be too long: ${wordCount} words`,
    });
  }
  
  // Check sections
  if (h2Count < TAYA_REQUIREMENTS.minSections) {
    issues.push({
      type: 'warning',
      message: `Not enough sections: ${h2Count} h2 tags (recommended: ${TAYA_REQUIREMENTS.minSections}+)`,
    });
  }
  
  // Check paragraphs
  if (pCount < TAYA_REQUIREMENTS.minParagraphs) {
    issues.push({
      type: 'warning',
      message: `Not enough paragraphs: ${pCount} (recommended: ${TAYA_REQUIREMENTS.minParagraphs}+)`,
    });
  }
  
  // Check for list overuse
  if (ulCount > 5 && pCount < ulCount * 2) {
    issues.push({
      type: 'info',
      message: 'High ratio of lists to paragraphs - content may feel like bullet points',
    });
  }
  
  return issues;
}

/**
 * Check Italian language quality
 */
function checkItalianQuality(text: string): QualityIssue[] {
  const issues: QualityIssue[] = [];
  
  // Check for common English words that should be Italian
  const englishWords = [
    { en: /\bperformance\b/gi, it: 'prestazioni' },
    { en: /\bfeature\b/gi, it: 'funzionalità/caratteristica' },
    { en: /\bfeedback\b/gi, it: 'riscontro/opinione' },
    { en: /\buser-friendly\b/gi, it: 'facile da usare' },
    { en: /\bstate-of-the-art\b/gi, it: 'all\'avanguardia' },
  ];
  
  for (const { en, it } of englishWords) {
    if (en.test(text)) {
      issues.push({
        type: 'info',
        message: `English word detected: consider using "${it}" instead`,
      });
    }
  }
  
  return issues;
}

/**
 * Main quality check function
 */
export function checkContentQuality(
  content: string,
  type: 'product' | 'article' = 'product'
): QualityReport {
  const issues: QualityIssue[] = [];
  const suggestions: string[] = [];
  
  // Run all checks
  issues.push(...checkRoboticPatterns(content));
  issues.push(...checkStructure(content));
  issues.push(...checkItalianQuality(content));
  
  // Check for human elements
  const humanCheck = checkHumanElements(content);
  if (humanCheck.missing) {
    issues.push({
      type: 'info',
      message: 'No personal/opinion phrases detected - content may feel impersonal',
    });
    suggestions.push('Consider adding phrases like "secondo me", "nella mia esperienza"');
  }
  
  // Calculate score
  let score = 100;
  
  for (const issue of issues) {
    switch (issue.type) {
      case 'critical':
        score -= 25;
        break;
      case 'warning':
        score -= 10;
        break;
      case 'info':
        score -= 3;
        break;
    }
  }
  
  // Bonus for human elements
  score += Math.min(humanCheck.found.length * 5, 15);
  
  // Clamp score
  score = Math.max(0, Math.min(100, score));
  
  // Generate suggestions based on issues
  if (issues.some(i => i.message.includes('Robotic pattern'))) {
    suggestions.push('Rewrite opening to start with a problem or question, not the product');
  }
  
  if (issues.some(i => i.message.includes('too short'))) {
    suggestions.push('Expand content with more specific examples and use cases');
  }
  
  if (issues.some(i => i.message.includes('Not enough sections'))) {
    suggestions.push('Add more H2 sections to improve readability and SEO');
  }
  
  return {
    score,
    passed: score >= 70 && !issues.some(i => i.type === 'critical'),
    issues,
    suggestions,
  };
}

/**
 * Quick check for product descriptions
 */
export function validateProductContent(description: string, pros: string[], cons: string[]): QualityReport {
  const fullContent = `${description}\n${pros.join('\n')}\n${cons.join('\n')}`;
  const report = checkContentQuality(fullContent, 'product');
  
  // Additional product-specific checks
  if (pros.length < 3) {
    report.issues.push({
      type: 'warning',
      message: `Only ${pros.length} pros provided (recommended: 3)`,
    });
    report.score -= 5;
  }
  
  if (cons.length < 2) {
    report.issues.push({
      type: 'warning',
      message: `Only ${cons.length} cons provided (recommended: 2) - may seem promotional`,
    });
    report.score -= 5;
  }
  
  // Check if cons are real or fake
  const fakeCons = [
    /prezzo (elevato|alto|premium)/i,
    /non adatto a tutti/i,
    /richiede pratica/i,
  ];
  
  for (const con of cons) {
    for (const pattern of fakeCons) {
      if (pattern.test(con)) {
        report.issues.push({
          type: 'info',
          message: `Generic con detected: "${con}" - consider more specific drawbacks`,
        });
      }
    }
  }
  
  report.passed = report.score >= 70;
  return report;
}

/**
 * Quick check for blog articles
 */
export function validateArticleContent(html: string): QualityReport {
  const report = checkContentQuality(html, 'article');
  
  // Article-specific checks
  const textOnly = html.replace(/<[^>]*>/g, ' ');
  
  // Check for call to action
  if (!/<a\s+href/i.test(html)) {
    report.issues.push({
      type: 'info',
      message: 'No links found in article - consider adding relevant internal links',
    });
  }
  
  // Check for images placeholder
  if (!/<img/i.test(html) && !textOnly.includes('[immagine]')) {
    report.suggestions.push('Consider adding images to break up text and improve engagement');
  }
  
  return report;
}
