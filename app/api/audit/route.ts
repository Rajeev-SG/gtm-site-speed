import { NextRequest, NextResponse } from 'next/server';
// lighthouse and chrome-launcher are ESM-only. We'll import them dynamically when needed to avoid Next.js's CJS bundle issues.

// Ensure the handler is not statically optimized and can run for longer periods.
export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Set max duration to 60 seconds for Vercel

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
 * Performs a single Lighthouse audit on a given URL.
 * It launches a headless Chrome instance, handles cookies/consents, runs the audit,
 * and extracts GTM-specific performance metrics.
 */
async function auditOnce(url: string): Promise<Omit<AuditResult, 'url' | 'status' | 'error'>> {
  // Dynamically import ESM-only deps
  const { default: lighthouse } = await import(/* webpackIgnore: true */ 'lighthouse');
  const { launch } = await import(/* webpackIgnore: true */ 'chrome-launcher');
  const chrome = await launch({
    /**
     * Note: --headless (old) is more stable across Chrome versions than --headless=new.
     * If audits fail to start, switch flag.
     */
    chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu'],
  });

  try {
    const runnerResult = await lighthouse(url, {
      port: chrome.port,
      onlyAudits: ['third-party-summary'],
      output: 'json',
    });
    const { lhr } = (runnerResult as any);



    // Find the Google Tag Manager summary from the audit details
    const gtmItem = lhr.audits['third-party-summary'].details?.items
      .find((item: any) =>
        (item.entity && typeof item.entity === 'string' && item.entity.includes('Google Tag Manager')) ||
        (item.url && typeof item.url === 'string' && item.url.includes('googletagmanager.com'))
      );

    if (!gtmItem) {
      throw new Error('Google Tag Manager not found on this page by Lighthouse.');
    }

    // Map Lighthouse metrics to our AuditResult interface
    return {
      blockingTime: gtmItem.blockingTime || 0,
      totalCpuTime: gtmItem.mainThreadTime || 0, // In this context, mainThreadTime is the total CPU time.
      scriptEvaluation: gtmItem.scriptEvaluation || 0,
      scriptParseTime: gtmItem.scriptParse || 0, // The frontend expects `scriptParseTime`
    };
  } finally {
    // Ensure Chrome is always killed
    await chrome.kill();
  }
}

/**
 * Runs the audit 3 times and averages the results for stability.
 */
async function auditURL(url: string): Promise<Omit<AuditResult, 'url' | 'status' | 'error'>> {
  const runs: Awaited<ReturnType<typeof auditOnce>>[] = [];
  const numberOfRuns = 3;
  for (let i = 0; i < numberOfRuns; i++) {
    runs.push(await auditOnce(url));
  }

  const mean = (key: keyof typeof runs[0]) =>
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
    console.error('[auditOnce] lighthouse failed:', error);
    throw error;
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[Audit Error] for URL ${url}:`, error instanceof Error ? error : errorMessage);
    
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