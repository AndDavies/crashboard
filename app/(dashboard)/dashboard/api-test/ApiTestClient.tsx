'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  Loader2, 
  CheckCircle2, 
  AlertCircle, 
  RefreshCw, 
  Server, 
  ExternalLink, 
  Settings, 
  Database,
  Twitter,
  BrainCircuit
} from 'lucide-react';
import { toast } from 'sonner';

interface ApiTest {
  name: string;
  status: 'success' | 'error' | 'warning';
  message?: string;
  latency?: number;
  details?: any;
}

interface ApiSummary {
  success: number;
  warning: number;
  error: number;
  notConfigured: number;
  totalServices: number;
  averageLatency: number;
}

interface ApiTestResponse {
  status: 'success' | 'error' | 'warning';
  message: string;
  execution_time_ms: number;
  timestamp: string;
  summary: ApiSummary;
  results: ApiTest[];
}

export default function ApiTestClient() {
  const [results, setResults] = useState<ApiTestResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [individualLoading, setIndividualLoading] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  const runAllTests = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/dashboard-api-test', {
        method: 'GET',
        headers: {
          'Cache-Control': 'no-cache',
        },
      });

      // Even if the response is not OK, we still try to parse the JSON
      // This is because our API returns JSON error objects
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        // If we got JSON error response, use that
        if (data && data.status === 'error') {
          // If we have partial results, show them anyway
          if (data.results && Array.isArray(data.results) && data.results.length > 0) {
            setResults(data);
            toast.warning('API tests completed with some errors');
          } else {
            throw new Error(data.message || `API test failed with status ${response.status}`);
          }
        } else {
          // No valid JSON error response
          throw new Error(`API test failed with status ${response.status}`);
        }
      } else {
        // Successful response
        setResults(data);
        toast.success('API diagnostic tests completed');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred';
      setError(errorMessage);
      toast.error('Failed to run API tests');
      console.error('API test error:', err);
    } finally {
      setLoading(false);
    }
  };

  const runSingleTest = async (apiName: string) => {
    setIndividualLoading(prev => ({ ...prev, [apiName]: true }));
    try {
      const response = await fetch(`/api/api-test/${apiName.toLowerCase().replace(/\s+/g, '-')}`, {
        method: 'GET',
        headers: {
          'Cache-Control': 'no-cache',
        },
      });

      const data = await response.json().catch(() => null);
      
      if (!response.ok || !data) {
        const errorMessage = (data && data.message) 
          ? data.message 
          : `API test failed with status ${response.status}`;
        
        // Even if the overall request failed, update just this API's result if we have results
        if (results) {
          const updatedResults = {
            ...results,
            results: results.results.map(result => 
              result.name === apiName 
                ? {
                    name: apiName,
                    status: 'error' as const,
                    message: errorMessage,
                    latency: 0,
                    details: data?.error || { error: `Failed with status ${response.status}` }
                  } 
                : result
            ),
            timestamp: new Date().toISOString()
          };
          
          // Recalculate summary
          recalculateSummary(updatedResults);
          
          setResults(updatedResults);
          toast.error(`Failed to test ${apiName}: ${errorMessage}`);
        } else {
          throw new Error(errorMessage);
        }
      } else if (data && data.result) {
        // Update just this API's result in the overall results
        if (results) {
          const updatedResults = {
            ...results,
            results: results.results.map(result => 
              result.name === apiName ? data.result : result
            ),
            timestamp: new Date().toISOString()
          };
          
          // Recalculate summary
          recalculateSummary(updatedResults);
          
          setResults(updatedResults);
          toast.success(`${apiName} test completed`);
        } else {
          // If no overall results exist yet, we'll just run all tests
          await runAllTests();
        }
      } else {
        throw new Error(`Invalid response from ${apiName} test`);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred';
      toast.error(`Failed to test ${apiName}: ${errorMessage}`);
      console.error(`Error testing ${apiName}:`, err);
    } finally {
      setIndividualLoading(prev => ({ ...prev, [apiName]: false }));
    }
  };
  
  // Helper function to recalculate summary and update status
  const recalculateSummary = (updatedResults: ApiTestResponse) => {
    const summary = {
      success: updatedResults.results.filter(r => r.status === 'success').length,
      warning: updatedResults.results.filter(r => r.status === 'warning').length,
      error: updatedResults.results.filter(r => r.status === 'error').length,
      notConfigured: updatedResults.results.filter(r => 
        r.status === 'error' && 
        (r.message?.includes('not configured') || r.message?.includes('credentials are not'))
      ).length,
      totalServices: updatedResults.results.length,
      averageLatency: updatedResults.results
        .filter(r => typeof r.latency === 'number' && r.latency > 0)
        .reduce((acc, r) => acc + (r.latency || 0), 0) / 
        updatedResults.results.filter(r => typeof r.latency === 'number' && r.latency > 0).length || 0
    };
    
    updatedResults.summary = summary;
    
    // Update overall status
    if (summary.error > 0) {
      updatedResults.status = 'error';
      updatedResults.message = `API diagnostics completed with ${summary.error} errors`;
    } else if (summary.warning > 0) {
      updatedResults.status = 'warning';
      updatedResults.message = `API diagnostics completed with ${summary.warning} warnings`;
    } else {
      updatedResults.status = 'success';
      updatedResults.message = 'All API diagnostics completed successfully';
    }
  };

  useEffect(() => {
    runAllTests();
  }, []);

  const formatLatency = (ms?: number) => {
    if (ms === undefined) return 'N/A';
    return `${ms.toFixed(2)} ms`;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  const getStatusColor = (status: 'success' | 'error' | 'warning') => {
    switch (status) {
      case 'success': return 'text-green-500';
      case 'warning': return 'text-amber-500';
      case 'error': return 'text-red-500';
      default: return 'text-red-500';
    }
  };

  const getStatusIcon = (status: 'success' | 'error' | 'warning') => {
    switch (status) {
      case 'success':
        return <CheckCircle2 className="w-5 h-5 text-green-500" />;
      case 'warning':
        return <AlertCircle className="w-5 h-5 text-amber-500" />;
      case 'error':
        return <AlertCircle className="w-5 h-5 text-red-500" />;
      default:
        return <AlertCircle className="w-5 h-5 text-red-500" />;
    }
  };

  const formatJson = (data: any) => {
    return JSON.stringify(data, null, 2);
  };

  const getCategoryIcon = (name: string) => {
    if (name.includes('Supabase')) {
      return <Database className="w-5 h-5 mr-2 text-violet-500" />;
    } else if (name.includes('OpenAI')) {
      return <BrainCircuit className="w-5 h-5 mr-2 text-green-600" />;
    } else if (name.includes('Twitter')) {
      return <Twitter className="w-5 h-5 mr-2 text-blue-400" />;
    } else {
      return <ExternalLink className="w-5 h-5 mr-2 text-gray-500" />;
    }
  };

  // Group results by API category
  const groupApiResults = () => {
    if (!results) return {};
    
    const groupedResults: Record<string, ApiTest[]> = {
      'Database': [],
      'OpenAI': [],
      'Social Media': [],
      'External': []
    };
    
    results.results.forEach(result => {
      if (result.name.includes('Supabase') || result.name.includes('Database')) {
        groupedResults['Database'].push(result);
      } else if (result.name.includes('OpenAI')) {
        groupedResults['OpenAI'].push(result);
      } else if (result.name.includes('Twitter')) {
        groupedResults['Social Media'].push(result);
      } else {
        groupedResults['External'].push(result);
      }
    });
    
    // Remove empty categories
    Object.keys(groupedResults).forEach(key => {
      if (groupedResults[key].length === 0) {
        delete groupedResults[key];
      }
    });
    
    return groupedResults;
  };

  // Get category icon
  const getApiCategoryIcon = (category: string) => {
    switch (category) {
      case 'Database':
        return <Database className="w-6 h-6 mr-2 text-violet-500" />;
      case 'OpenAI':
        return <BrainCircuit className="w-6 h-6 mr-2 text-green-600" />;
      case 'Social Media':
        return <Twitter className="w-6 h-6 mr-2 text-blue-400" />;
      case 'External':
        return <ExternalLink className="w-6 h-6 mr-2 text-gray-500" />;
      default:
        return <Server className="w-6 h-6 mr-2 text-gray-500" />;
    }
  };

  return (
    <div className="space-y-6 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">API Diagnostics</h1>
        <Button 
          onClick={runAllTests} 
          disabled={loading}
          className="flex items-center"
        >
          {loading ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4 mr-2" />
          )}
          {loading ? 'Running Tests...' : 'Test All APIs'}
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between w-full">
            <div className="flex items-start">
              <AlertCircle className="h-4 w-4 mt-1 mr-2" />
              <div>
                <AlertTitle>Error Running API Tests</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </div>
            </div>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={runAllTests}
              className="mt-4 sm:mt-0 sm:ml-4 bg-red-50 hover:bg-red-100 dark:bg-red-900/30 dark:hover:bg-red-900/50"
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
              ) : (
                <RefreshCw className="w-3 h-3 mr-1" />
              )}
              Retry Tests
            </Button>
          </div>
        </Alert>
      )}

      {/* Add a retry banner if we have results but some tests failed */}
      {results && results.status === 'error' && (
        <Alert variant="destructive" className="bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between w-full">
            <div className="flex items-start">
              <AlertCircle className="h-4 w-4 mt-1 mr-2" />
              <div>
                <AlertTitle>Some API Tests Failed</AlertTitle>
                <AlertDescription>{results.message || 'Some API diagnostic tests encountered errors'}</AlertDescription>
              </div>
            </div>
            <div className="flex gap-2 mt-4 sm:mt-0 sm:ml-4">
              <Button 
                variant="outline" 
                size="sm" 
                className="bg-red-50 hover:bg-red-100 dark:bg-red-900/30 dark:hover:bg-red-900/50"
                onClick={runAllTests}
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                ) : (
                  <RefreshCw className="w-3 h-3 mr-1" />
                )}
                Retry All Tests
              </Button>
            </div>
          </div>
        </Alert>
      )}
      
      {/* Add a warning banner for tests with warnings */}
      {results && results.status === 'warning' && (
        <Alert variant="default" className="bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between w-full">
            <div className="flex items-start">
              <AlertCircle className="h-4 w-4 mt-1 mr-2 text-amber-500" />
              <div>
                <AlertTitle>API Tests Completed with Warnings</AlertTitle>
                <AlertDescription className="text-amber-700 dark:text-amber-400">{results.message || 'Some API diagnostic tests have warnings'}</AlertDescription>
              </div>
            </div>
            <Button 
              variant="outline" 
              size="sm" 
              className="mt-4 sm:mt-0 sm:ml-4 border-amber-200 bg-amber-50 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-900/30 dark:hover:bg-amber-900/50"
              onClick={runAllTests}
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
              ) : (
                <RefreshCw className="w-3 h-3 mr-1" />
              )}
              Run Tests Again
            </Button>
          </div>
        </Alert>
      )}

      {results && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                {getStatusIcon(results.status)}
                <span className={`ml-2 ${getStatusColor(results.status)}`}>
                  API Diagnostic Summary
                </span>
              </CardTitle>
              <CardDescription>
                Last updated: {formatDate(results.timestamp)}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col md:flex-row gap-4 mb-6">
                <div className="flex-1 rounded-lg p-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <h3 className="text-sm font-medium mb-2">Overall Status</h3>
                  <div className="flex items-center space-x-2">
                    {getStatusIcon(results.status)}
                    <span className={`font-medium ${getStatusColor(results.status)}`}>
                      {results.status === 'success' 
                        ? 'All systems operational' 
                        : results.status === 'warning'
                          ? 'Some systems have warnings'
                          : 'Some systems are down'}
                    </span>
                  </div>
                  <div className="mt-4">
                    <Progress 
                      value={(results.summary.success / results.summary.totalServices) * 100} 
                      className="h-2"
                    />
                    <div className="mt-1 flex justify-between text-xs text-gray-500">
                      <span>{results.summary.success} of {results.summary.totalServices} operational</span>
                      <span>{((results.summary.success / results.summary.totalServices) * 100).toFixed(0)}%</span>
                    </div>
                  </div>
                </div>
                
                <div className="flex-1 rounded-lg p-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <h3 className="text-sm font-medium mb-2">Response Times</h3>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm">Average:</span>
                      <span className="font-mono text-sm">{formatLatency(results.summary.averageLatency)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm">Total execution:</span>
                      <span className="font-mono text-sm">{formatLatency(results.execution_time_ms)}</span>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="flex gap-2 flex-wrap">
                <div className="flex items-center gap-1">
                  <div className="h-3 w-3 rounded-full bg-green-500"></div>
                  <span className="text-xs">Success: {results.summary.success}</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="h-3 w-3 rounded-full bg-amber-500"></div>
                  <span className="text-xs">Warning: {results.summary.warning}</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="h-3 w-3 rounded-full bg-red-500"></div>
                  <span className="text-xs">Error: {results.summary.error}</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="h-3 w-3 rounded-full bg-slate-300 dark:bg-slate-700"></div>
                  <span className="text-xs">Not Configured: {results.summary.notConfigured}</span>
                </div>
              </div>
            </CardContent>
          </Card>
          
          {/* Group API tests by category */}
          {Object.entries(groupApiResults()).map(([category, apis]) => (
            <Card key={category} className="overflow-hidden">
              <CardHeader className="pb-0">
                <CardTitle className="flex items-center text-xl">
                  {getApiCategoryIcon(category)}
                  {category} APIs
                </CardTitle>
                <CardDescription>
                  Test and monitor {category.toLowerCase()} API endpoints
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 pt-6">
                {apis.map((api, index) => (
                  <div key={api.name} className={`${index > 0 ? 'pt-4 border-t border-gray-100 dark:border-gray-800' : ''}`}>
                    <div className="flex flex-col md:flex-row md:items-center justify-between mb-4 gap-4">
                      <div className="flex items-center">
                        {getCategoryIcon(api.name)}
                        <div>
                          <h3 className="font-medium">{api.name}</h3>
                          <p className="text-sm text-gray-500 dark:text-gray-400">{api.message}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge 
                          variant={api.status === 'success' 
                            ? 'default' 
                            : api.status === 'warning' 
                              ? 'outline' 
                              : 'destructive'} 
                          className={`${api.status === 'warning' ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400' : ''}`}
                        >
                          {api.status.toUpperCase()}
                        </Badge>
                        
                        <Badge variant="outline" className="bg-slate-50 dark:bg-slate-900">
                          {formatLatency(api.latency)}
                        </Badge>
                        
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => runSingleTest(api.name)}
                          disabled={individualLoading[api.name]}
                        >
                          {individualLoading[api.name] ? (
                            <Loader2 className="h-3 w-3 animate-spin mr-1" />
                          ) : (
                            <RefreshCw className="h-3 w-3 mr-1" />
                          )}
                          Test
                        </Button>
                      </div>
                    </div>
                    
                    <Accordion type="single" collapsible className="w-full">
                      <AccordionItem value={api.name} className="border-0">
                        <AccordionTrigger className="py-2 text-sm">View Details</AccordionTrigger>
                        <AccordionContent>
                          <div className="rounded-md bg-slate-50 dark:bg-slate-900 p-4 mt-2 border border-slate-200 dark:border-slate-800">
                            {api.details ? (
                              <pre className="text-xs overflow-auto p-3 bg-white dark:bg-slate-800 rounded-md border border-slate-200 dark:border-slate-700">
                                {formatJson(api.details)}
                              </pre>
                            ) : (
                              <p className="text-sm text-slate-500">No additional details available</p>
                            )}
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {loading && !results && (
        <div className="flex flex-col items-center justify-center py-12">
          <Loader2 className="w-10 h-10 animate-spin text-primary mb-4" />
          <p className="text-lg font-medium">Running API diagnostics...</p>
          <p className="text-sm text-slate-500 mt-2">This may take a few moments</p>
        </div>
      )}
    </div>
  );
} 