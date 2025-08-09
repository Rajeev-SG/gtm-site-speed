import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
// lighthouse and chrome-launcher are ESM-only. We'll import them dynamically when needed to avoid Next.js's CJS bundle issues.

// Ensure the handler is not statically optimized and can run for longer periods.
export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Set max duration to 60 seconds for Vercel

// Chrome flags reused across runs for serverless reliability
const CHROME_FLAGS = [
  '--headless',
  '--disable-gpu',
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--remote-debugging-address=0.0.0.0',
];


/**
 * Creates a request-scoped logger with a consistent prefix.
 */
function createLogger(requestId: string) {
  const prefix = `[AUDIT_API][${requestId}]`;
  return {
    info: (...args: unknown[]) => console.log(prefix, ...args),
    error: (...args: unknown[]) => console.error(prefix, ...args),
  } as const;
}

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
async function auditURL(url: string, logger: ReturnType<typeof createLogger>): Promise<Omit<AuditResult, 'url' | 'status' | 'error'>> {
  const [{ default: lighthouse }, { launch }] = await Promise.all([
    import(/* webpackIgnore: true */ 'lighthouse'),
    import(/* webpackIgnore: true */ 'chrome-launcher'),
  ]);

  logger.info('Starting auditURL for', url);
const auditStart = Date.now();
  // Launch Chrome with explicit path, flags, and host for Docker/K8s
  const chrome = await launch({
    chromePath: process.env.CHROME_PATH,
    chromeFlags: CHROME_FLAGS,
  });
  logger.info('Chrome started on port', chrome.port);

  // Ensure the DevTools endpoint is reachable – important when running in containers
  try {
    await fetch(`http://127.0.0.1:${chrome.port}/json/version`);
  } catch (e) {
    logger.error('DevTools endpoint not accessible:', e);
  }
  const runs: Array<GtmMetric[]> = [];
  const numberOfRuns = 3;

  try {
    for (let i = 0; i < numberOfRuns; i++) {
      logger.info(`Starting Lighthouse run ${i + 1}/${numberOfRuns} for ${url}`);
      const runStart = Date.now();
      const runnerResult = await lighthouse(url, {
        port: chrome.port,
        onlyAudits: ['bootup-time'],
        output: 'json',
      });
      const { lhr } = runnerResult as any;
      const metrics = extractMetrics(lhr).gtmMetrics;
      runs.push(metrics);
      logger.info(
        `Finished Lighthouse run ${i + 1}/${numberOfRuns} in ${((Date.now() - runStart) / 1000).toFixed(1)}s`,
      );
      logger.info('Extracted metrics:', metrics);
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

    logger.info('Averaged metrics:', averaged);
  logger.info(`auditURL for ${url} took ${((Date.now() - auditStart) / 1000).toFixed(2)}s`);
  return { gtmMetrics: averaged };
}

// -----------------------------
// API Handler
// -----------------------------

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({ url: null }));
  const { url } = body;
  const requestId = uuidv4();
  const logger = createLogger(requestId);
  const requestStart = Date.now();
  logger.info('Received POST request', { url, timestamp: new Date().toISOString() });

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
    const { gtmMetrics } = await auditURL(url, logger);
    const totalMs = Date.now() - requestStart;
    logger.info(`Completed request in ${totalMs}ms`);
    return NextResponse.json({ url, status: 'success', gtmMetrics } as AuditResult);
  } catch (err: unknown) {
    logger.error('Error processing request:', err instanceof Error ? err.stack : err);
    const message = err instanceof Error ? err.message : String(err);
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
