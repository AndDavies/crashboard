import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/utils/supabase/server";
import { OpenAI } from 'openai';
import { formatErrorForDisplay, generateDiagnosticSummary } from '../../(dashboard)/dashboard/api-test/utils';

interface ApiTest {
  name: string;
  status: 'success' | 'error' | 'warning';
  message?: string;
  latency?: number;
  details?: any;
}

export async function GET(request: Request) {
  const results: ApiTest[] = [];
  const startTime = Date.now();

  try {
    // Test Supabase connections (main database and blog if configured)
    await testSupabaseConnection(results);
    
    try {
      await testSupabaseBlogConnection(results);
    } catch (error) {
      console.error('Error testing Supabase blog:', error);
      results.push({
        name: 'Supabase Blog Database',
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error testing Supabase blog database',
        latency: 0,
        details: formatErrorForDisplay(error)
      });
    }
    
    // Test OpenAI API for different services
    try {
      await testOpenAIAPI(results);
    } catch (error) {
      console.error('Error testing OpenAI API:', error);
      results.push({
        name: 'OpenAI API',
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error testing OpenAI API',
        latency: 0,
        details: formatErrorForDisplay(error)
      });
    }
    
    try {
      await testOpenAITitleGeneration(results);
    } catch (error) {
      console.error('Error testing OpenAI title generation:', error);
      results.push({
        name: 'OpenAI Title Generation',
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error testing OpenAI title generation',
        latency: 0,
        details: formatErrorForDisplay(error)
      });
    }
    
    // Test Twitter API if credentials exist
    try {
      await testTwitterAPI(results);
    } catch (error) {
      console.error('Error testing Twitter API:', error);
      results.push({
        name: 'Twitter API',
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error testing Twitter API',
        latency: 0,
        details: formatErrorForDisplay(error)
      });
    }
    
    // Test external API fetch capabilities
    try {
      await testExternalFetch(results);
    } catch (error) {
      console.error('Error testing external fetch:', error);
      results.push({
        name: 'External API Fetch',
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error testing external API fetch',
        latency: 0,
        details: formatErrorForDisplay(error)
      });
    }

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
        name: 'Supabase Main Database',
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
      // Try to check tables used by the application - avoid count(*) syntax
      const tableChecks = await Promise.all([
        supabase.from('reminders').select('id').limit(1),
        supabase.from('prompts').select('id').limit(1),
      ]);
      
      const tableErrors = tableChecks
        .filter(check => check.error)
        .map(check => check.error)
        .filter((err): err is NonNullable<typeof err> => err !== null);
      
      if (tableErrors.length > 0) {
        results.push({
          name: 'Supabase Main Database',
          status: 'error',
          message: 'Connected to Supabase database, but encountered errors accessing application tables',
          latency: Date.now() - testStart,
          details: {
            table_errors: tableErrors.map(err => ({
              code: err.code,
              message: err.message,
              details: err.details
            }))
          }
        });
      } else {
        results.push({
          name: 'Supabase Main Database',
          status: 'success',
          message: 'Successfully connected to Supabase database and accessed application tables',
          latency: Date.now() - testStart,
          details: {
            tables_checked: ['reminders', 'prompts', 'quote_of_the_day']
          }
        });
      }
    }
  } catch (error) {
    results.push({
      name: 'Supabase Main Database',
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error connecting to Supabase database',
      latency: Date.now() - testStart,
      details: formatErrorForDisplay(error)
    });
  }
}

async function testSupabaseBlogConnection(results: ApiTest[]) {
  const testStart = Date.now();
  try {
    const blogUrl = process.env.NEXT_PUBLIC_SUPABASE_BLOG_URL;
    const blogKey = process.env.NEXT_PUBLIC_SUPABASE_BLOG_ANON_KEY;
    
    if (!blogUrl || !blogKey) {
      results.push({
        name: 'Supabase Blog Database',
        status: 'warning',
        message: 'Supabase Blog credentials not configured',
        latency: Date.now() - testStart
      });
      return;
    }
    
    // Import the module dynamically if it exists
    try {
      const { createClient } = await import('@supabase/supabase-js');
      const supabaseBlog = createClient(blogUrl, blogKey);
      
      // Try a simple query - avoid count(*) syntax
      const { error } = await supabaseBlog.from('blog_posts').select('id').limit(1);
      
      if (error) {
        results.push({
          name: 'Supabase Blog Database',
          status: 'error',
          message: `Failed to connect to Supabase Blog database: ${error.message}`,
          latency: Date.now() - testStart,
          details: {
            error_code: error.code,
            error_details: error.details,
            error_hint: error.hint
          }
        });
      } else {
        results.push({
          name: 'Supabase Blog Database',
          status: 'success',
          message: 'Successfully connected to Supabase Blog database',
          latency: Date.now() - testStart
        });
      }
    } catch (importError) {
      results.push({
        name: 'Supabase Blog Database',
        status: 'error',
        message: 'Blog database configured but failed to initialize client',
        latency: Date.now() - testStart,
        details: importError instanceof Error ? importError.message : 'Unknown import error'
      });
    }
  } catch (error) {
    results.push({
      name: 'Supabase Blog Database',
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error connecting to Supabase blog database',
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
        status: 'warning',
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

async function testOpenAITitleGeneration(results: ApiTest[]) {
  const testStart = Date.now();
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    
    if (!apiKey) {
      results.push({
        name: 'OpenAI Title Generation',
        status: 'warning',
        message: 'OpenAI API key is not configured for title generation',
        latency: Date.now() - testStart
      });
      return;
    }
    
    const openai = new OpenAI({ apiKey });
    
    // Specific test for title generation prompt
    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        { 
          role: 'system', 
          content: 'You are a helpful assistant that generates engaging titles for content.'
        },
        { 
          role: 'user', 
          content: 'Generate a title for an article about API diagnostics testing.'
        }
      ],
      max_tokens: 20,
    });
    
    if (response.choices && response.choices.length > 0) {
      results.push({
        name: 'OpenAI Title Generation',
        status: 'success',
        message: 'Successfully tested OpenAI title generation',
        latency: Date.now() - testStart,
        details: {
          model: 'gpt-3.5-turbo',
          generated_title: response.choices[0].message.content
        }
      });
    } else {
      results.push({
        name: 'OpenAI Title Generation',
        status: 'error',
        message: 'OpenAI title generation returned an empty response',
        latency: Date.now() - testStart,
        details: response
      });
    }
  } catch (error) {
    results.push({
      name: 'OpenAI Title Generation',
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error in OpenAI title generation',
      latency: Date.now() - testStart,
      details: formatErrorForDisplay(error)
    });
  }
}

async function testTwitterAPI(results: ApiTest[]) {
  const testStart = Date.now();
  try {
    // Check if Twitter API tokens are configured
    const twitterApiKey = process.env.TWITTER_API_KEY;
    const twitterApiSecret = process.env.TWITTER_API_SECRET;
    const twitterAccessToken = process.env.TWITTER_ACCESS_TOKEN;
    const twitterAccessSecret = process.env.TWITTER_ACCESS_SECRET;
    
    if (!twitterApiKey || !twitterApiSecret || !twitterAccessToken || !twitterAccessSecret) {
      results.push({
        name: 'Twitter API',
        status: 'warning',
        message: 'Twitter API credentials are not fully configured',
        latency: Date.now() - testStart,
        details: {
          missing_credentials: [
            !twitterApiKey ? 'TWITTER_API_KEY' : null,
            !twitterApiSecret ? 'TWITTER_API_SECRET' : null,
            !twitterAccessToken ? 'TWITTER_ACCESS_TOKEN' : null,
            !twitterAccessSecret ? 'TWITTER_ACCESS_SECRET' : null
          ].filter(Boolean)
        }
      });
      return;
    }
    
    // Instead of making a real API call which might require a complex setup,
    // we'll just check if the endpoint is reachable
    try {
      const testUrl = 'https://api.twitter.com';
      const response = await fetch(testUrl, { method: 'HEAD' });
      
      if (response.ok) {
        results.push({
          name: 'Twitter API',
          status: 'success',
          message: 'Twitter API endpoint is reachable and credentials are configured',
          latency: Date.now() - testStart,
          details: {
            note: "This is a configuration check and endpoint reachability test. No authenticated API call was made."
          }
        });
      } else {
        results.push({
          name: 'Twitter API',
          status: 'error',
          message: `Twitter API endpoint returned status ${response.status}`,
          latency: Date.now() - testStart,
          details: {
            endpoint: testUrl,
            status: response.status
          }
        });
      }
    } catch (fetchError) {
      results.push({
        name: 'Twitter API',
        status: 'error',
        message: 'Failed to reach Twitter API endpoint',
        latency: Date.now() - testStart,
        details: formatErrorForDisplay(fetchError)
      });
    }
  } catch (error) {
    results.push({
      name: 'Twitter API',
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error testing Twitter API',
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
          test_url: testUrl,
          sample_data: data
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
      message: error instanceof Error ? error.message : 'Unknown error during external fetch test',
      latency: Date.now() - testStart,
      details: formatErrorForDisplay(error)
    });
  }
} 