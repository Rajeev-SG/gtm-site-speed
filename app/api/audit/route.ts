import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

interface AuditResult {
  url: string;
  blockingTime: number;
  totalCpuTime: number;
  scriptEvaluation: number;
  scriptParseTime: number;
  status: 'success' | 'error';
  error?: string;
}

// Simulate realistic GTM performance data
function generateRealisticMetrics(url: string): Omit<AuditResult, 'url' | 'status'> {
  // Create some variation based on URL characteristics
  const urlHash = Array.from(url).reduce((hash, char) => hash + char.charCodeAt(0), 0);
  const random = (seed: number) => ((seed * 9301 + 49297) % 233280) / 233280;
  
  // Base metrics with realistic ranges
  const baseBlockingTime = 50 + random(urlHash) * 200; // 50-250ms
  const baseCpuTime = 200 + random(urlHash + 1) * 600; // 200-800ms
  const baseScriptEval = 80 + random(urlHash + 2) * 300; // 80-380ms
  const baseParseTime = 30 + random(urlHash + 3) * 150; // 30-180ms
  
  // Add some correlation between metrics (heavier sites have higher times across all metrics)
  const siteComplexity = random(urlHash + 4);
  const complexityMultiplier = 0.8 + siteComplexity * 0.6; // 0.8-1.4x
  
  return {
    blockingTime: Math.round(baseBlockingTime * complexityMultiplier),
    totalCpuTime: Math.round(baseCpuTime * complexityMultiplier),
    scriptEvaluation: Math.round(baseScriptEval * complexityMultiplier),
    scriptParseTime: Math.round(baseParseTime * complexityMultiplier)
  };
}

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json();
    
    if (!url || typeof url !== 'string') {
      return NextResponse.json(
        { error: 'URL is required and must be a string' },
        { status: 400 }
      );
    }

    // Validate URL format
    try {
      new URL(url);
    } catch {
      return NextResponse.json(
        { error: 'Invalid URL format' },
        { status: 400 }
      );
    }

    // Simulate network delay (3-8 seconds to be realistic)
    const delay = 3000 + Math.random() * 5000;
    await new Promise(resolve => setTimeout(resolve, delay));

    // Simulate occasional failures (5% chance)
    if (Math.random() < 0.05) {
      return NextResponse.json({
        url,
        blockingTime: 0,
        totalCpuTime: 0,
        scriptEvaluation: 0,
        scriptParseTime: 0,
        status: 'error',
        error: 'Failed to connect to URL'
      } as AuditResult);
    }

    // Generate realistic performance metrics
    const metrics = generateRealisticMetrics(url);
    
    const result: AuditResult = {
      url,
      ...metrics,
      status: 'success'
    };

    return NextResponse.json(result);
    
  } catch (error) {
    console.error('Audit API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}