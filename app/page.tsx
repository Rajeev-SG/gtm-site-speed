'use client';

import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Download, Play, RotateCcw, AlertCircle, CheckCircle, Clock, TrendingUp } from 'lucide-react';

interface AuditResult {
  url: string;
  blockingTime: number;
  totalCpuTime: number;
  scriptEvaluation: number;
  scriptParseTime: number;
  status: 'success' | 'error';
  error?: string;
}

interface AuditSummary {
  totalUrls: number;
  successfulAudits: number;
  averageBlockingTime: number;
  averageCpuTime: number;
  averageScriptEval: number;
  averageParseTime: number;
}

export default function GTMPerformanceAuditor() {
  const [urls, setUrls] = useState('');
  const [isAuditing, setIsAuditing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentUrl, setCurrentUrl] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [totalUrls, setTotalUrls] = useState(0);
  const [estimatedTimeRemaining, setEstimatedTimeRemaining] = useState(0);
  const [results, setResults] = useState<AuditResult[]>([]);
  const [summary, setSummary] = useState<AuditSummary | null>(null);
  const [error, setError] = useState('');

  const validateUrls = (urlList: string[]): string[] => {
    const urlRegex = /^https?:\/\/.+/;
    return urlList.filter(url => {
      const trimmed = url.trim();
      return trimmed && urlRegex.test(trimmed);
    });
  };

  const getPerformanceStatus = (value: number, metric: 'blocking' | 'cpu' | 'script'): 'good' | 'warning' | 'critical' => {
    const thresholds = {
      blocking: { warning: 100, critical: 300 },
      cpu: { warning: 500, critical: 1000 },
      script: { warning: 200, critical: 500 }
    };
    
    const threshold = thresholds[metric];
    if (value <= threshold.warning) return 'good';
    if (value <= threshold.critical) return 'warning';
    return 'critical';
  };

  const getStatusColor = (status: 'good' | 'warning' | 'critical'): string => {
    switch (status) {
      case 'good': return 'text-green-600 bg-green-50';
      case 'warning': return 'text-yellow-600 bg-yellow-50';
      case 'critical': return 'text-red-600 bg-red-50';
    }
  };

  const calculateSummary = (results: AuditResult[]): AuditSummary => {
    const successfulResults = results.filter(r => r.status === 'success');
    const total = successfulResults.length;
    
    if (total === 0) {
      return {
        totalUrls: results.length,
        successfulAudits: 0,
        averageBlockingTime: 0,
        averageCpuTime: 0,
        averageScriptEval: 0,
        averageParseTime: 0
      };
    }

    return {
      totalUrls: results.length,
      successfulAudits: total,
      averageBlockingTime: Math.round(successfulResults.reduce((sum, r) => sum + r.blockingTime, 0) / total),
      averageCpuTime: Math.round(successfulResults.reduce((sum, r) => sum + r.totalCpuTime, 0) / total),
      averageScriptEval: Math.round(successfulResults.reduce((sum, r) => sum + r.scriptEvaluation, 0) / total),
      averageParseTime: Math.round(successfulResults.reduce((sum, r) => sum + r.scriptParseTime, 0) / total)
    };
  };

  const startAudit = useCallback(async () => {
    setError('');
    const urlList = urls.split('\n').map(url => url.trim()).filter(Boolean);
    const validUrls = validateUrls(urlList);

    if (validUrls.length === 0) {
      setError('Please enter at least one valid URL (must start with http:// or https://)');
      return;
    }

    if (validUrls.length !== urlList.length) {
      setError(`${urlList.length - validUrls.length} invalid URLs were removed. Only valid URLs starting with http:// or https:// will be audited.`);
    }

    setIsAuditing(true);
    setProgress(0);
    setResults([]);
    setSummary(null);
    setTotalUrls(validUrls.length);
    setEstimatedTimeRemaining(validUrls.length * 10);

    const newResults: AuditResult[] = [];
    const startTime = Date.now();

    for (let i = 0; i < validUrls.length; i++) {
      const url = validUrls[i];
      setCurrentUrl(url);
      setCurrentIndex(i + 1);
      
      // Update estimated time remaining
      const elapsed = (Date.now() - startTime) / 1000;
      const averageTimePerUrl = elapsed / (i + 1);
      const remaining = Math.max(0, Math.round((validUrls.length - i - 1) * averageTimePerUrl));
      setEstimatedTimeRemaining(remaining);

      try {
        const response = await fetch('/api/audit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url })
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const result = await response.json();
        newResults.push(result);
      } catch (err) {
        newResults.push({
          url,
          blockingTime: 0,
          totalCpuTime: 0,
          scriptEvaluation: 0,
          scriptParseTime: 0,
          status: 'error',
          error: err instanceof Error ? err.message : 'Unknown error'
        });
      }

      setProgress(((i + 1) / validUrls.length) * 100);
    }

    setResults(newResults);
    setSummary(calculateSummary(newResults));
    setIsAuditing(false);
    setCurrentUrl('');
    setEstimatedTimeRemaining(0);
  }, [urls]);

  const exportToCSV = () => {
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `gtm-audit-${timestamp}.csv`;
    
    const headers = ['URL', 'Blocking Time (ms)', 'Total CPU Time (ms)', 'Script Evaluation (ms)', 'Script Parse Time (ms)', 'Status', 'Error'];
    const csvContent = [
      headers.join(','),
      ...results.map(result => [
        `"${result.url}"`,
        result.blockingTime,
        result.totalCpuTime,
        result.scriptEvaluation,
        result.scriptParseTime,
        result.status,
        `"${result.error || ''}"`
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const clearResults = () => {
    setUrls('');
    setResults([]);
    setSummary(null);
    setError('');
    setProgress(0);
  };

  const formatTime = (seconds: number): string => {
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-4">
      <div className="mx-auto max-w-7xl space-y-8">
        {/* Header */}
        <div className="text-center space-y-4">
          <div className="flex items-center justify-center gap-3">
            <div className="flex items-center justify-center w-12 h-12 bg-blue-600 rounded-lg">
              <TrendingUp className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-4xl font-bold text-slate-900">GTM Performance Auditor</h1>
          </div>
          <p className="text-lg text-slate-600 max-w-2xl mx-auto">
            Analyze Google Tag Manager performance across multiple URLs to identify blocking times, CPU usage, and script execution metrics.
          </p>
        </div>

        {/* Input Section */}
        <Card className="shadow-lg border-0 bg-white">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2">
              <Play className="w-5 h-5 text-blue-600" />
              URL Input
            </CardTitle>
            <CardDescription>
              Enter URLs to audit (one per line). Each URL must start with http:// or https://
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              placeholder="Enter URLs to audit (one per line)&#10;https://example.com&#10;https://another-site.com&#10;https://third-site.com"
              value={urls}
              onChange={(e) => setUrls(e.target.value)}
              className="min-h-32 resize-none font-mono text-sm"
              disabled={isAuditing}
            />
            <div className="flex gap-3">
              <Button 
                onClick={startAudit} 
                disabled={isAuditing || !urls.trim()}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6"
              >
                <Play className="w-4 h-4 mr-2" />
                {isAuditing ? 'Auditing...' : 'Start GTM Performance Audit'}
              </Button>
              {(results.length > 0 || error) && (
                <Button 
                  variant="outline" 
                  onClick={clearResults}
                  disabled={isAuditing}
                >
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Clear Results
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Error Display */}
        {error && (
          <Alert className="border-amber-200 bg-amber-50">
            <AlertCircle className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-amber-800">{error}</AlertDescription>
          </Alert>
        )}

        {/* Progress Section */}
        {isAuditing && (
          <Card className="shadow-lg border-0 bg-white">
            <CardContent className="pt-6 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="w-5 h-5 text-blue-600 animate-spin" />
                  <span className="font-medium">Audit in Progress</span>
                </div>
                <Badge variant="secondary" className="px-3 py-1">
                  {currentIndex} of {totalUrls}
                </Badge>
              </div>
              <Progress value={progress} className="h-2" />
              <div className="flex justify-between text-sm text-slate-600">
                <span>Currently auditing: <span className="font-mono text-blue-600">{currentUrl}</span></span>
                <span>Est. time remaining: {formatTime(estimatedTimeRemaining)}</span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Summary Section */}
        {summary && (
          <Card className="shadow-lg border-0 bg-white">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-green-600" />
                Audit Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                <div className="text-center p-4 bg-slate-50 rounded-lg">
                  <div className="text-2xl font-bold text-slate-900">{summary.totalUrls}</div>
                  <div className="text-sm text-slate-600">Total URLs</div>
                </div>
                <div className="text-center p-4 bg-green-50 rounded-lg">
                  <div className="text-2xl font-bold text-green-600">{summary.successfulAudits}</div>
                  <div className="text-sm text-slate-600">Successful</div>
                </div>
                <div className="text-center p-4 bg-blue-50 rounded-lg">
                  <div className="text-2xl font-bold text-blue-600">{summary.averageBlockingTime}ms</div>
                  <div className="text-sm text-slate-600">Avg Blocking</div>
                </div>
                <div className="text-center p-4 bg-purple-50 rounded-lg">
                  <div className="text-2xl font-bold text-purple-600">{summary.averageCpuTime}ms</div>
                  <div className="text-sm text-slate-600">Avg CPU</div>
                </div>
                <div className="text-center p-4 bg-orange-50 rounded-lg">
                  <div className="text-2xl font-bold text-orange-600">{summary.averageScriptEval}ms</div>
                  <div className="text-sm text-slate-600">Avg Script Eval</div>
                </div>
                <div className="text-center p-4 bg-teal-50 rounded-lg">
                  <div className="text-2xl font-bold text-teal-600">{summary.averageParseTime}ms</div>
                  <div className="text-sm text-slate-600">Avg Parse</div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Results Section */}
        {results.length > 0 && (
          <Card className="shadow-lg border-0 bg-white">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <CardTitle>Audit Results</CardTitle>
                <Button onClick={exportToCSV} variant="outline" size="sm">
                  <Download className="w-4 h-4 mr-2" />
                  Download CSV
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-64">URL</TableHead>
                      <TableHead className="text-center">Blocking Time (ms)</TableHead>
                      <TableHead className="text-center">Total CPU Time (ms)</TableHead>
                      <TableHead className="text-center">Script Evaluation (ms)</TableHead>
                      <TableHead className="text-center">Script Parse Time (ms)</TableHead>
                      <TableHead className="text-center">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {results.map((result, index) => (
                      <TableRow key={index} className="hover:bg-slate-50">
                        <TableCell className="font-mono text-sm max-w-64 truncate" title={result.url}>
                          {result.url}
                        </TableCell>
                        <TableCell className="text-center">
                          {result.status === 'success' ? (
                            <span className={`px-2 py-1 rounded-full text-sm font-medium ${getStatusColor(getPerformanceStatus(result.blockingTime, 'blocking'))}`}>
                              {result.blockingTime}
                            </span>
                          ) : '-'}
                        </TableCell>
                        <TableCell className="text-center">
                          {result.status === 'success' ? (
                            <span className={`px-2 py-1 rounded-full text-sm font-medium ${getStatusColor(getPerformanceStatus(result.totalCpuTime, 'cpu'))}`}>
                              {result.totalCpuTime}
                            </span>
                          ) : '-'}
                        </TableCell>
                        <TableCell className="text-center">
                          {result.status === 'success' ? (
                            <span className={`px-2 py-1 rounded-full text-sm font-medium ${getStatusColor(getPerformanceStatus(result.scriptEvaluation, 'script'))}`}>
                              {result.scriptEvaluation}
                            </span>
                          ) : '-'}
                        </TableCell>
                        <TableCell className="text-center">
                          {result.status === 'success' ? (
                            <span className={`px-2 py-1 rounded-full text-sm font-medium ${getStatusColor(getPerformanceStatus(result.scriptParseTime, 'script'))}`}>
                              {result.scriptParseTime}
                            </span>
                          ) : '-'}
                        </TableCell>
                        <TableCell className="text-center">
                          {result.status === 'success' ? (
                            <Badge variant="secondary" className="bg-green-100 text-green-800">Success</Badge>
                          ) : (
                            <Badge variant="destructive" title={result.error}>Error</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              
              {/* Performance Legend */}
              <Separator className="my-6" />
              <div className="space-y-3">
                <h4 className="font-medium text-slate-900">Performance Thresholds</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                  <div className="space-y-2">
                    <div className="font-medium">Blocking Time</div>
                    <div className="flex items-center gap-2"><span className="w-3 h-3 bg-green-500 rounded-full"></span>≤100ms: Good</div>
                    <div className="flex items-center gap-2"><span className="w-3 h-3 bg-yellow-500 rounded-full"></span>101-300ms: Warning</div>
                    <div className="flex items-center gap-2"><span className="w-3 h-3 bg-red-500 rounded-full"></span>>300ms: Critical</div>
                  </div>
                  <div className="space-y-2">
                    <div className="font-medium">CPU Time</div>
                    <div className="flex items-center gap-2"><span className="w-3 h-3 bg-green-500 rounded-full"></span>≤500ms: Good</div>
                    <div className="flex items-center gap-2"><span className="w-3 h-3 bg-yellow-500 rounded-full"></span>501-1000ms: Warning</div>
                    <div className="flex items-center gap-2"><span className="w-3 h-3 bg-red-500 rounded-full"></span>>1000ms: Critical</div>
                  </div>
                  <div className="space-y-2">
                    <div className="font-medium">Script Times</div>
                    <div className="flex items-center gap-2"><span className="w-3 h-3 bg-green-500 rounded-full"></span>≤200ms: Good</div>
                    <div className="flex items-center gap-2"><span className="w-3 h-3 bg-yellow-500 rounded-full"></span>201-500ms: Warning</div>
                    <div className="flex items-center gap-2"><span className="w-3 h-3 bg-red-500 rounded-full"></span>>500ms: Critical</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}