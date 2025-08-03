import { NextRequest, NextResponse } from 'next/server';
// lighthouse and chrome-launcher are ESM-only. We'll import them dynamically when needed to avoid Next.js's CJS bundle issues.

// Ensure the handler is not statically optimized and can run for longer periods.
export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Set max duration to 60 seconds for Vercel

// Chrome flags reused across runs for serverless reliability
const CHROME_FLAGS = [
  '--headless=new',
  '--no-sandbox',
  '--no-zygote',
  '--single-process',
  '--disable-dev-shm-usage',
];

// -----------------------------
// Type Definitions
// -----------------------------

/**
 * Metrics for a single GTM container.
 */
interface GtmMetric {
  containerId: string;
  totalCpuTime: number;
  scriptEvaluation: number;
  scriptParseTime: number;
}

/**
 * API response shape. Must stay in sync with the frontend.
 */
interface AuditResult {
  url: string;
  status: 'success' | 'error';
  error?: string;
  gtmMetrics: GtmMetric[];
}

// -----------------------------
// Helpers
// -----------------------------

/**
 * Extracts GTM-specific metrics from Lighthouse results, returning one entry per
 * container. Uses the `bootup-time` audit because it provides per-script CPU
 * usage.
 */
function extractMetrics(lhr: any): Omit<AuditResult, 'url' | 'status' | 'error'> {
  const bootupItems = lhr.audits['bootup-time']?.details?.items ?? [];
  const gtmMetrics: GtmMetric[] = [];
  const gtmRegex = /gtm\.js\?id=(GTM-[A-Z0-9]+)/;

  for (const item of bootupItems) {
    if (typeof item.url !== 'string') continue;
    const match = item.url.match(gtmRegex);
    if (!match) continue;

    const containerId = match[1];
    gtmMetrics.push({
      containerId,
      // `total` is the total CPU time spent in that script.
      totalCpuTime: item.total ?? 0,
      // `scripting` covers evaluation.
      scriptEvaluation: item.scripting ?? 0,
      // `scriptParseCompile` covers parsing/compilation.
      scriptParseTime: item.scriptParseCompile ?? 0,
    });
  }

  if (gtmMetrics.length === 0) {
    throw new Error(
      'No Google Tag Manager container scripts (gtm.js) found on this page by Lighthouse.',
    );
  }

  return { gtmMetrics };
}

/**
 * Runs Lighthouse three times and returns averaged metrics for stability.
 */
async function auditURL(url: string): Promise<Omit<AuditResult, 'url' | 'status' | 'error'>> {
  const [{ default: lighthouse }, { launch }] = await Promise.all([
    import(/* webpackIgnore: true */ 'lighthouse'),
    import(/* webpackIgnore: true */ 'chrome-launcher'),
  ]);

  const chrome = await launch({ chromeFlags: CHROME_FLAGS });
  const runs: Array<GtmMetric[]> = [];
  const numberOfRuns = 3;

  try {
    for (let i = 0; i < numberOfRuns; i++) {
      const runnerResult = await lighthouse(url, {
        port: chrome.port,
        onlyAudits: ['bootup-time'],
        output: 'json',
      });
      const { lhr } = runnerResult as any;
      runs.push(extractMetrics(lhr).gtmMetrics);
    }
  } finally {
    await chrome.kill();
  }

  // Aggregate & average across runs per container ID.
  const aggregated = new Map<
    string,
    { total: number[]; eval: number[]; parse: number[] }
  >();

  for (const run of runs) {
    for (const metric of run) {
      if (!aggregated.has(metric.containerId)) {
        aggregated.set(metric.containerId, { total: [], eval: [], parse: [] });
      }
      const entry = aggregated.get(metric.containerId)!;
      entry.total.push(metric.totalCpuTime);
      entry.eval.push(metric.scriptEvaluation);
      entry.parse.push(metric.scriptParseTime);
    }
  }

  const mean = (arr: number[]) =>
    arr.reduce((sum, v) => sum + v, 0) / (arr.length || 1);

  const averaged: GtmMetric[] = [];
  aggregated.forEach((data, containerId) => {
    averaged.push({
      containerId,
      totalCpuTime: Math.round(mean(data.total)),
      scriptEvaluation: Math.round(mean(data.eval)),
      scriptParseTime: Math.round(mean(data.parse)),
    });
  });

  return { gtmMetrics: averaged };
}

// -----------------------------
// API Handler
// -----------------------------

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({ url: null }));
  const { url } = body;

  if (!url || typeof url !== 'string') {
    return NextResponse.json({ error: 'URL is required and must be a string' }, { status: 400 });
  }

  try {
    new URL(url);
  } catch {
    return NextResponse.json(
      {
        url,
        status: 'error',
        error: 'Invalid URL format',
        gtmMetrics: [],
      } as AuditResult,
      { status: 400 },
    );
  }

  try {
    const { gtmMetrics } = await auditURL(url);
    return NextResponse.json({ url, status: 'success', gtmMetrics } as AuditResult);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[auditURL] lighthouse failed:', message);
    return NextResponse.json(
      {
        url,
        status: 'error',
        error: message,
        gtmMetrics: [],
      } as AuditResult,
      { status: 500 },
    );
  }
}
