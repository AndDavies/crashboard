import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/utils/supabase/server";
import { OpenAI } from 'openai';

interface ApiTest {
  name: string;
  status: 'success' | 'error' | 'warning';
  message?: string;
  latency?: number;
  details?: any;
}

// Import helper functions from dashboard utils
import { formatErrorForDisplay } from "@/app/(dashboard)/dashboard/api-test/utils";

// Helper function to create diagnostic summary
function generateDiagnosticSummary(testResults: ApiTest[]): {
  success: number;
  warning: number;
  error: number;
  notConfigured: number;
  totalServices: number;
  averageLatency: number;
} {
  const success = testResults.filter(test => test.status === 'success').length;
  const warning = testResults.filter(test => test.status === 'warning').length;
  const error = testResults.filter(test => test.status === 'error').length;
  const notConfigured = testResults.filter(test => 
    test.status === 'error' && 
    (test.message?.includes('not configured') || test.message?.includes('credentials are not'))
  ).length;
  
  const latencies = testResults
    .filter(test => typeof test.latency === 'number')
    .map(test => test.latency as number);
    
  const averageLatency = latencies.length 
    ? latencies.reduce((sum, latency) => sum + latency, 0) / latencies.length 
    : 0;
  
  return {
    success,
    warning,
    error,
    notConfigured,
    totalServices: testResults.length,
    averageLatency
  };
}

// Main API test handler
export async function GET(request: Request) {
  const results: ApiTest[] = [];
  const startTime = Date.now();

  try {
    // Test Supabase connections
    await testSupabaseConnection(results);
    
    // Test OpenAI API
    await testOpenAIAPI(results);
    
    // Test external API fetch capabilities
    await testExternalFetch(results);

    // Get total execution time
    const executionTime = Date.now() - startTime;
    
    // Generate diagnostic summary
    const summary = generateDiagnosticSummary(results);
    
    // Determine overall status
    let overallStatus: 'success' | 'error' | 'warning' = 'success';
    let statusMessage = 'All API diagnostics completed successfully';

    if (summary.error > 0) {
      overallStatus = 'error';
      statusMessage = `API diagnostics completed with ${summary.error} errors`;
    } else if (summary.warning > 0) {
      overallStatus = 'warning';
      statusMessage = `API diagnostics completed with ${summary.warning} warnings`;
    }

    return NextResponse.json({
      status: overallStatus,
      message: statusMessage,
      execution_time_ms: executionTime,
      timestamp: new Date().toISOString(),
      summary,
      results
    });
  } catch (error) {
    console.error('Error during API diagnostics:', error);
    return NextResponse.json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error during API diagnostics',
      execution_time_ms: Date.now() - startTime,
      timestamp: new Date().toISOString(),
      results,
      error: formatErrorForDisplay(error)
    }, { status: 500 });
  }
}

// Test functions implementations - simplified versions
async function testSupabaseConnection(results: ApiTest[]) {
  const testStart = Date.now();
  try {
    const supabase = await createSupabaseServerClient();
    
    // Check connection by making a simple query - avoid count(*) syntax
    const { data, error } = await supabase
      .from('quote_of_the_day')
      .select('id')
      .limit(1);
    
    if (error) {
      results.push({
        name: 'Supabase Database',
        status: 'error',
        message: `Failed to connect to Supabase database: ${error.message}`,
        latency: Date.now() - testStart,
        details: {
          error_code: error.code,
          error_details: error.details,
          error_hint: error.hint
        }
      });
    } else {
      results.push({
        name: 'Supabase Database',
        status: 'success',
        message: 'Successfully connected to Supabase database',
        latency: Date.now() - testStart
      });
    }
  } catch (error) {
    results.push({
      name: 'Supabase Database',
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error connecting to Supabase database',
      latency: Date.now() - testStart,
      details: formatErrorForDisplay(error)
    });
  }
}

async function testOpenAIAPI(results: ApiTest[]) {
  const testStart = Date.now();
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    
    if (!apiKey) {
      results.push({
        name: 'OpenAI API',
        status: 'error',
        message: 'OpenAI API key is not configured',
        latency: Date.now() - testStart
      });
      return;
    }
    
    const openai = new OpenAI({ apiKey });
    
    // Simple test request
    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: 'Hello, this is a test message to verify API connectivity.' }],
      max_tokens: 5,
    });
    
    if (response.choices && response.choices.length > 0) {
      results.push({
        name: 'OpenAI API',
        status: 'success',
        message: 'Successfully connected to OpenAI API',
        latency: Date.now() - testStart,
        details: {
          model: 'gpt-3.5-turbo',
          response_sample: response.choices[0].message.content
        }
      });
    } else {
      results.push({
        name: 'OpenAI API',
        status: 'error',
        message: 'OpenAI API returned an empty response',
        latency: Date.now() - testStart,
        details: response
      });
    }
  } catch (error) {
    results.push({
      name: 'OpenAI API',
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error connecting to OpenAI API',
      latency: Date.now() - testStart,
      details: formatErrorForDisplay(error)
    });
  }
}

async function testExternalFetch(results: ApiTest[]) {
  const testStart = Date.now();
  try {
    // Test the external fetch capabilities
    const testUrl = 'https://jsonplaceholder.typicode.com/posts/1';
    const response = await fetch(testUrl);
    
    if (response.ok) {
      const data = await response.json();
      
      results.push({
        name: 'External API Fetch',
        status: 'success',
        message: 'Successfully fetched data from external API',
        latency: Date.now() - testStart,
        details: {
          test_url: testUrl
        }
      });
    } else {
      // Try an alternative endpoint if the first one fails
      const fallbackUrl = 'https://httpbin.org/get';
      const fallbackRes = await fetch(fallbackUrl);
      
      if (fallbackRes.ok) {
        results.push({
          name: 'External API Fetch',
          status: 'success',
          message: 'Successfully fetched data from fallback external API',
          latency: Date.now() - testStart,
          details: {
            test_url: fallbackUrl
          }
        });
      } else {
        results.push({
          name: 'External API Fetch',
          status: 'error',
          message: 'Failed to fetch from external APIs',
          latency: Date.now() - testStart,
          details: {
            urls_tested: [testUrl, fallbackUrl],
            primary_status: response.status,
            fallback_status: fallbackRes.status
          }
        });
      }
    }
  } catch (error) {
    results.push({
      name: 'External API Fetch',
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error fetching from external API',
      latency: Date.now() - testStart,
      details: formatErrorForDisplay(error)
    });
  }
} 