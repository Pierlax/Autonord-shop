// Benchmark runs can take several minutes with LLM judge enabled
export const maxDuration = 300;

/**
 * RAG Benchmark Endpoint — v1 vs v2 KPI measurement
 *
 * Misura i 3 KPI della Universal RAG v2:
 *   1. Coverage Gain         — quante specifiche in più trova
 *   2. Precision after Expansion — rilevanza delle evidenze del secondo pass
 *   3. Loop Efficiency       — quando vale la pena il retrieval iterativo
 *
 * Usage:
 *   GET  /api/test/rag-benchmark
 *         → benchmark sui prodotti campione predefiniti (SAMPLE_PRODUCTS)
 *
 *   POST /api/test/rag-benchmark
 *        Body: { products: [{title, vendor, productType, sku}], llmJudge?: boolean }
 *         → benchmark su prodotti custom
 *
 *   GET  /api/test/rag-benchmark?product=makita_ddf484
 *         → benchmark su un singolo prodotto campione per slug
 *
 * Auth: richiede ?secret=<CRON_SECRET> come il worker principale.
 */

import { NextRequest, NextResponse } from 'next/server';
import { env } from '@/lib/env';
import {
  benchmarkProduct,
  benchmarkSuite,
  BenchmarkProduct,
  BenchmarkResult,
  BenchmarkSummary,
} from '@/lib/shopify/rag-benchmark';

// ---------------------------------------------------------------------------
// Sample products for Autonord's heterogeneous catalogue
// Covers: power tools, generators, excavators, construction, vehicle parts
// ---------------------------------------------------------------------------

const SAMPLE_PRODUCTS: Record<string, BenchmarkProduct> = {
  makita_ddf484: {
    title: 'DDF484Z Trapano avvitatore 18V LXT',
    vendor: 'Makita',
    productType: 'Trapano avvitatore',
    sku: 'DDF484Z',
  },
  milwaukee_m18: {
    title: 'M18 FUEL Smerigliatrice angolare 115mm',
    vendor: 'Milwaukee',
    productType: 'Smerigliatrice angolare',
    sku: 'M18FDAG115-0',
  },
  tecnogen_generatore: {
    title: 'TT3000SLE Gruppo elettrogeno 3 kVA diesel silenziato',
    vendor: 'Tecnogen',
    productType: 'Gruppo elettrogeno',
    sku: 'TT3000SLE',
  },
  cangini_benna: {
    title: 'BF 250 Benna frantumatore idraulica',
    vendor: 'Cangini',
    productType: 'Benna frantumatore',
    sku: 'BF250',
  },
  nilfisk_aspiratore: {
    title: 'VP300 HEPA Aspiratore industriale trifase',
    vendor: 'Nilfisk',
    productType: 'Aspiratore industriale',
    sku: 'VP300HEPA',
  },
  husqvarna_tagliasfalto: {
    title: 'K970 Troncatrice a disco per asfalto e calcestruzzo',
    vendor: 'Husqvarna',
    productType: 'Troncatrice',
    sku: 'K970',
  },
  bosch_martello: {
    title: 'GBH 18V-26 F Martello perforatore SDS Plus 18V',
    vendor: 'Bosch',
    productType: 'Martello perforatore',
    sku: 'GBH18V-26F',
  },
};

// ---------------------------------------------------------------------------
// Auth helper
// ---------------------------------------------------------------------------

function isAuthorized(req: NextRequest): boolean {
  const secret = req.nextUrl.searchParams.get('secret');
  return secret === env.CRON_SECRET;
}

// ---------------------------------------------------------------------------
// GET — run on predefined sample products
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const productSlug = req.nextUrl.searchParams.get('product');
  const llmJudge = req.nextUrl.searchParams.get('llmJudge') === 'true';

  // Single product mode
  if (productSlug) {
    const product = SAMPLE_PRODUCTS[productSlug];
    if (!product) {
      return NextResponse.json(
        { error: `Unknown product slug. Available: ${Object.keys(SAMPLE_PRODUCTS).join(', ')}` },
        { status: 400 }
      );
    }

    try {
      const result = await benchmarkProduct(product, llmJudge);
      return NextResponse.json(formatSingleResult(result), { status: 200 });
    } catch (err) {
      return NextResponse.json(
        { error: `Benchmark failed: ${err instanceof Error ? err.message : String(err)}` },
        { status: 500 }
      );
    }
  }

  // Suite mode: run first 3 sample products (to stay within timeout)
  const sampleKeys = Object.keys(SAMPLE_PRODUCTS).slice(0, 3);
  const products = sampleKeys.map(k => SAMPLE_PRODUCTS[k]);

  try {
    const summary = await benchmarkSuite(products, llmJudge);
    return NextResponse.json(formatSummary(summary), { status: 200 });
  } catch (err) {
    return NextResponse.json(
      { error: `Benchmark suite failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// POST — run on custom products
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { products?: BenchmarkProduct[]; llmJudge?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { products, llmJudge = false } = body;

  if (!products || !Array.isArray(products) || products.length === 0) {
    return NextResponse.json(
      { error: 'Body must contain products: [{title, vendor, productType, sku}]' },
      { status: 400 }
    );
  }

  // Cap at 5 products per request to prevent timeout
  const capped = products.slice(0, 5);

  if (capped.length === 1) {
    try {
      const result = await benchmarkProduct(capped[0], llmJudge);
      return NextResponse.json(formatSingleResult(result), { status: 200 });
    } catch (err) {
      return NextResponse.json(
        { error: `Benchmark failed: ${err instanceof Error ? err.message : String(err)}` },
        { status: 500 }
      );
    }
  }

  try {
    const summary = await benchmarkSuite(capped, llmJudge);
    return NextResponse.json(formatSummary(summary), { status: 200 });
  } catch (err) {
    return NextResponse.json(
      { error: `Benchmark suite failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// Response formatters — human-readable + machine-parseable
// ---------------------------------------------------------------------------

function formatSingleResult(r: BenchmarkResult) {
  return {
    product: r.product,
    verdict: r.verdict,
    verdictReason: r.verdictReason,
    timestamp: r.timestamp,

    kpi: {
      coverageGain: {
        label: 'KPI 1 — Coverage Gain',
        v1Specs: r.coverageGain.v1SpecCount,
        v2Specs: r.coverageGain.v2SpecCount,
        absoluteGain: r.coverageGain.absoluteGain,
        relativeGainPct: `${(r.coverageGain.relativeGain * 100).toFixed(1)}%`,
        v1EvidenceItems: r.coverageGain.v1EvidenceItems,
        v2EvidenceItems: r.coverageGain.v2EvidenceItems,
        pdfGain: r.coverageGain.pdfGain,
        tableGain: r.coverageGain.tableGain,
        newSpecs: r.coverageGain.newSpecs,
      },
      precisionAfterExpansion: {
        label: 'KPI 2 — Precision after Expansion',
        secondPassItems: r.precisionAfterExpansion.secondPassItems,
        relevantItems: r.precisionAfterExpansion.relevantItems,
        precisionPct: `${(r.precisionAfterExpansion.precision * 100).toFixed(1)}%`,
        irrelevantSamples: r.precisionAfterExpansion.irrelevantSamples,
        usedLlmJudge: r.precisionAfterExpansion.usedLlmJudge,
      },
      loopEfficiency: {
        label: 'KPI 3 — Loop Efficiency',
        qualityBefore: r.loopEfficiency.qualityBefore.toFixed(3),
        qualityAfter: r.loopEfficiency.qualityAfter.toFixed(3),
        delta: (r.loopEfficiency.qualityAfter - r.loopEfficiency.qualityBefore).toFixed(3),
        passesUsed: r.loopEfficiency.passesUsed,
        efficiency: r.loopEfficiency.efficiency.toFixed(3),
        beneficial: r.loopEfficiency.loopBeneficial,
        usefulGapQueries: r.loopEfficiency.usefulGapQueries,
        passSummary: r.loopEfficiency.passSummary,
      },
    },

    timing: {
      v1Ms: r.v1ExecutionMs,
      v2Ms: r.v2ExecutionMs,
      overheadMs: r.v2OverheadMs,
      overheadSec: `${(r.v2OverheadMs / 1000).toFixed(1)}s`,
    },
  };
}

function formatSummary(s: BenchmarkSummary) {
  return {
    summary: {
      productsRun: s.products.length,
      avgCoverageGainPct: `${(s.avgCoverageGain * 100).toFixed(1)}%`,
      avgPrecisionPct: `${(s.avgPrecision * 100).toFixed(1)}%`,
      avgLoopEfficiency: s.avgLoopEfficiency.toFixed(3),
      loopBeneficialRate: `${(s.loopBeneficialRate * 100).toFixed(0)}% of products`,
      avgV2OverheadSec: `${(s.avgV2OverheadMs / 1000).toFixed(1)}s`,
      v2WinsRate: `${(s.v2WinsRate * 100).toFixed(0)}% of products`,
    },
    products: s.products.map(r => ({
      title: r.product.title,
      vendor: r.product.vendor,
      verdict: r.verdict,
      verdictReason: r.verdictReason,
      coverageGainPct: `${(r.coverageGain.relativeGain * 100).toFixed(1)}%`,
      precisionPct: `${(r.precisionAfterExpansion.precision * 100).toFixed(1)}%`,
      loopEfficiency: r.loopEfficiency.efficiency.toFixed(3),
      overheadSec: `${(r.v2OverheadMs / 1000).toFixed(1)}s`,
    })),
  };
}
