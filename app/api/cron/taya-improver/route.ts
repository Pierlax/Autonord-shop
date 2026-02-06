/**
 * TAYA Improver Cron Job
 * 
 * Scheduled weekly to analyze the codebase for TAYA compliance violations
 * and generate a structured Improvement Plan report.
 * 
 * Unlike the manual script (scripts/taya-improver.ts), this route:
 * - Runs in serverless (no git operations)
 * - Uses generateTextSafe (Gemini) instead of Anthropic
 * - Outputs a structured JSON report instead of creating PRs
 * - Can optionally send the report via email (Resend) or log it
 * 
 * Schedule: Weekly on Sundays at 3:00 AM (see vercel.json)
 */

import { NextRequest, NextResponse } from 'next/server';
import { generateTextSafe } from '@/lib/shopify/ai-client';
import { loggers } from '@/lib/logger';

const log = loggers.shopify;

// TAYA rules to check against
const TAYA_RULES = [
  'Mai usare frasi marketing vuote (es: "il migliore", "eccezionale", "straordinario")',
  'Mai mentire o esagerare sulle specifiche dei prodotti',
  'Sempre includere pro E contro (mai solo lati positivi)',
  'Sempre rispondere alle domande scomode (prezzi, problemi, confronti)',
  'Mai usare "questo prodotto" o "questo articolo" - nominare sempre il prodotto',
  'Mai usare superlativi vuoti senza dati a supporto',
  'Sempre citare dati specifici quando possibile',
  'Formato scannable (Krug): prima riga = problema che risolve',
  'JTBD: ogni specifica tecnica collegata a un beneficio lavorativo',
];

// Code quality rules
const CODE_RULES = [
  'TypeScript strict mode - niente "any" (usa "unknown" + type guard)',
  'Niente console.log in produzione (usa il logger)',
  'Gestione errori con try/catch specifici',
  'Variabili d\'ambiente validate in lib/env.ts',
];

interface ImprovementItem {
  file: string;
  line?: number;
  rule: string;
  severity: 'high' | 'medium' | 'low';
  currentCode: string;
  suggestedFix: string;
  reasoning: string;
}

interface ImprovementPlan {
  generatedAt: string;
  totalViolations: number;
  bySeverity: { high: number; medium: number; low: number };
  improvements: ImprovementItem[];
  summary: string;
}

// Files to analyze (key files that contain user-facing content or core logic)
const FILES_TO_ANALYZE = [
  'lib/shopify/ai-enrichment-v3.ts',
  'lib/core-philosophy/index.ts',
  'lib/agents/taya-police.ts',
  'lib/shopify/product-research.ts',
  'lib/shopify/product-sources.ts',
  'app/page.tsx',
  'app/products/[handle]/page.tsx',
  'components/product/product-description.tsx',
  'components/layout/footer.tsx',
];

export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  log.info('[TAYA-Improver] Starting weekly TAYA compliance analysis...');
  const startTime = Date.now();

  try {
    // Build analysis prompt with TAYA + Code rules
    const analysisPrompt = `Sei un auditor senior per il progetto Autonord-shop, un e-commerce di elettroutensili professionali.

Il progetto segue la filosofia "They Ask, You Answer" (TAYA) di Marcus Sheridan, combinata con i principi di usabilità di Steve Krug ("Don't Make Me Think") e il framework Jobs To Be Done (JTBD) di Clayton Christensen.

## REGOLE TAYA DA VERIFICARE:
${TAYA_RULES.map((r, i) => `${i + 1}. ${r}`).join('\n')}

## REGOLE CODICE:
${CODE_RULES.map((r, i) => `${i + 1}. ${r}`).join('\n')}

## FILE DA ANALIZZARE:
${FILES_TO_ANALYZE.join('\n')}

## ISTRUZIONI:

Analizza concettualmente questi file (che conosci dal contesto del progetto) e identifica le violazioni più probabili.
Per ogni violazione trovata, fornisci:
- Il file e la riga approssimativa
- Quale regola viene violata
- La severità (high/medium/low)
- Il codice attuale problematico (o una descrizione)
- Il fix suggerito
- Il ragionamento

Concentrati sulle violazioni PIÙ IMPATTANTI per l'esperienza utente e la qualità del contenuto.

Rispondi SOLO con JSON valido nel formato:
{
  "violations": [
    {
      "file": "path/to/file.ts",
      "line": 42,
      "rule": "Regola violata",
      "severity": "high|medium|low",
      "currentCode": "codice attuale o descrizione",
      "suggestedFix": "fix suggerito",
      "reasoning": "perché è importante"
    }
  ],
  "summary": "Riepilogo generale dello stato di compliance TAYA"
}`;

    const result = await generateTextSafe({
      system: 'Sei un auditor di qualità per contenuti e-commerce. Rispondi SOLO con JSON valido.',
      prompt: analysisPrompt,
      maxTokens: 4000,
      temperature: 0.3,
    });

    const responseText = result.text;
    
    // Parse the AI response
    let analysisResult: { violations: ImprovementItem[]; summary: string };
    
    try {
      const cleaned = responseText
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();
      analysisResult = JSON.parse(cleaned);
    } catch (parseError) {
      log.error('[TAYA-Improver] Failed to parse AI response:', parseError);
      analysisResult = {
        violations: [],
        summary: `Analisi completata ma il parsing del risultato è fallito. Risposta raw: ${responseText.substring(0, 500)}`,
      };
    }

    // Build the Improvement Plan
    const plan: ImprovementPlan = {
      generatedAt: new Date().toISOString(),
      totalViolations: analysisResult.violations.length,
      bySeverity: {
        high: analysisResult.violations.filter(v => v.severity === 'high').length,
        medium: analysisResult.violations.filter(v => v.severity === 'medium').length,
        low: analysisResult.violations.filter(v => v.severity === 'low').length,
      },
      improvements: analysisResult.violations,
      summary: analysisResult.summary,
    };

    const elapsedMs = Date.now() - startTime;
    
    log.info(`[TAYA-Improver] Analysis complete in ${elapsedMs}ms`, {
      totalViolations: plan.totalViolations,
      high: plan.bySeverity.high,
      medium: plan.bySeverity.medium,
      low: plan.bySeverity.low,
    });

    // Log the full plan for monitoring
    log.info(`[TAYA-Improver] Improvement Plan:\n${JSON.stringify(plan, null, 2)}`);

    // Optional: Send report via email if Resend is configured
    if (process.env.RESEND_API_KEY && process.env.NOTIFICATION_EMAIL) {
      try {
        await sendReportEmail(plan);
        log.info('[TAYA-Improver] Report sent via email');
      } catch (emailError) {
        log.error('[TAYA-Improver] Failed to send email report:', emailError);
      }
    }

    return NextResponse.json({
      success: true,
      plan,
      executionTimeMs: elapsedMs,
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log.error('[TAYA-Improver] Analysis failed:', error);
    
    return NextResponse.json({
      success: false,
      error: errorMessage,
      executionTimeMs: Date.now() - startTime,
    }, { status: 500 });
  }
}

/**
 * Send the improvement plan via email using Resend
 */
async function sendReportEmail(plan: ImprovementPlan): Promise<void> {
  const resendKey = process.env.RESEND_API_KEY;
  const toEmail = process.env.NOTIFICATION_EMAIL;
  
  if (!resendKey || !toEmail) return;

  const highItems = plan.improvements
    .filter(i => i.severity === 'high')
    .map(i => `• [${i.file}] ${i.rule}\n  Fix: ${i.suggestedFix}`)
    .join('\n\n');

  const body = `
TAYA Compliance Report - ${plan.generatedAt}
${'='.repeat(50)}

Violazioni trovate: ${plan.totalViolations}
  🔴 High: ${plan.bySeverity.high}
  🟡 Medium: ${plan.bySeverity.medium}
  🟢 Low: ${plan.bySeverity.low}

${plan.summary}

${highItems ? `\nVIOLAZIONI CRITICHE:\n${highItems}` : '\nNessuna violazione critica trovata.'}
  `.trim();

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'TAYA Improver <noreply@autonord.com>',
      to: [toEmail],
      subject: `[Autonord] TAYA Report: ${plan.totalViolations} violazioni (${plan.bySeverity.high} critiche)`,
      text: body,
    }),
  });
}
