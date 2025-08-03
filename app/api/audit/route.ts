import { NextRequest, NextResponse } from 'next/server';
// lighthouse and chrome-launcher are ESM-only. We'll import them dynamically when needed to avoid Next.js's CJS bundle issues.

// Ensure the handler is not statically optimized and can run for longer periods.
export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Set max duration to 60 seconds for Vercel
// Chrome flags reused across runs for serverless reliability
const CHROME_FLAGS = ['--headless=new', '--no-sandbox', '--no-zygote', '--single-process', '--disable-dev-shm-usage'];

// This interface must match the one used in `app/page.tsx`
interface AuditResult {
  url: string;
  blockingTime: number;
  totalCpuTime: number;
  scriptEvaluation: number;
  scriptParseTime: number;
  status: 'success' | 'error';
  error?: string;
}

/**
 * Extracts GTM-specific metrics from Lighthouse results combining both
 * `third-party-summary` and `bootup-time` audits.
 */
function extractMetrics(lhr: any): Omit<AuditResult, 'url' | 'status' | 'error'> {
  const thirdPartyItems = lhr.audits['third-party-summary']?.details?.items ?? [];
  const bootupItems = lhr.audits['bootup-time']?.details?.items ?? [];

  const isGTM = (i: any) =>
    i?.entity?.text?.includes('Google Tag Manager') ||
    (typeof i?.entity === 'string' && i.entity.includes('Google Tag Manager')) ||
    (i.url && typeof i.url === 'string' && i.url.includes('googletagmanager.com'));

  const gtmItem = thirdPartyItems.find(isGTM);
  const gtmBoot = bootupItems.find((i: any) => i.url?.includes('googletagmanager.com'));

  if (!gtmItem) throw new Error('Google Tag Manager not found on this page by Lighthouse.');

  return {
    blockingTime: gtmItem.blockingTime || 0,
    totalCpuTime: gtmItem.mainThreadTime || 0,
    scriptEvaluation: gtmBoot?.scripting || 0,
    scriptParseTime: gtmBoot?.scriptParseCompile || 0,
  };
}

/**
 * @deprecated Use `auditURL` instead. This thin wrapper is kept for backward compatibility.
 */
async function auditOnce(url: string): Promise<Omit<AuditResult, 'url' | 'status' | 'error'>> {
  return auditURL(url);
}

/**
 * Runs the audit 3 times and averages the results for stability.
 */
type Run = ReturnType<typeof extractMetrics>;

async function auditURL(url: string): Promise<Omit<AuditResult, 'url' | 'status' | 'error'>> {
  // Dynamically import ESM-only deps once for all runs to save startup time.
  const [{ default: lighthouse }, { launch }] = await Promise.all([
    import(/* webpackIgnore: true */ 'lighthouse'),
    import(/* webpackIgnore: true */ 'chrome-launcher'),
  ]);

  const chrome = await launch({ chromeFlags: CHROME_FLAGS });
  const numberOfRuns = 3;
  const runs: Array<Omit<AuditResult, 'url' | 'status' | 'error'>> = [];

  try {
    for (let i = 0; i < numberOfRuns; i++) {
      const runnerResult = await lighthouse(url, {
        port: chrome.port,
        onlyAudits: ['third-party-summary', 'bootup-time'],
        output: 'json',
      });
      const { lhr } = runnerResult as any;
      runs.push(extractMetrics(lhr));
    }
  } finally {
    await chrome.kill();
  }

  const mean = <K extends keyof Run>(key: K) =>
    runs.reduce((sum, current) => sum + current[key], 0) / numberOfRuns;

  return {
    blockingTime: Math.round(mean('blockingTime')),
    totalCpuTime: Math.round(mean('totalCpuTime')),
    scriptEvaluation: Math.round(mean('scriptEvaluation')),
    scriptParseTime: Math.round(mean('scriptParseTime')),
  };
}

/**
 * The Next.js API route handler for POST requests.
 * This is the entry point for our API.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({ url: null }));
  const { url } = body;

  if (!url || typeof url !== 'string') {
    return NextResponse.json({ error: 'URL is required and must be a string' }, { status: 400 });
  }

  try {
    new URL(url);
  } catch {
    return NextResponse.json({
        url,
        status: 'error',
        error: 'Invalid URL format',
    } as AuditResult, { status: 400 });
  }

  try {
    const metrics = await auditURL(url);
    const result: AuditResult = {
      url,
      ...metrics,
      status: 'success',
    };
    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error('[auditURL] lighthouse failed:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[Audit Error] for URL ${url}:`, errorMessage);
    
    return NextResponse.json({
      url,
      blockingTime: 0,
      totalCpuTime: 0,
      scriptEvaluation: 0,
      scriptParseTime: 0,
      status: 'error',
      error: errorMessage,
    } as AuditResult, { status: 500 });
  }
}