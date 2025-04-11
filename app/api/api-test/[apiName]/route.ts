import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/utils/supabase/server";
import { OpenAI } from 'openai';
import { formatErrorForDisplay } from "@/app/(dashboard)/dashboard/api-test/utils";

interface ApiTest {
  name: string;
  status: 'success' | 'error' | 'warning';
  message?: string;
  latency?: number;
  details?: any;
}

export async function GET(
  request: Request,
  { params }: { params: { apiName: string } }
) {
  const { apiName } = params;
  const apiNameFormatted = apiName.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  
  let result: ApiTest | null = null;
  const startTime = Date.now();
  
  try {
    // Run the appropriate test based on the API name
    switch (apiNameFormatted.toLowerCase()) {
      case 'supabase database':
        result = await runSupabaseTest();
        break;
      case 'openai api':
        result = await runOpenAITest();
        break;
      case 'external api fetch':
        result = await runExternalFetchTest();
        break;
      case 'twitter api':
        result = await runTwitterTest();
        break;
      default:
        return NextResponse.json({
          status: 'error',
          message: `Unknown API test: ${apiNameFormatted}`,
          timestamp: new Date().toISOString(),
        }, { status: 400 });
    }
    
    return NextResponse.json({
      status: 'success',
      message: `Successfully ran test for ${apiNameFormatted}`,
      execution_time_ms: Date.now() - startTime,
      timestamp: new Date().toISOString(),
      result
    });
  } catch (error) {
    console.error(`Error testing ${apiNameFormatted}:`, error);
    return NextResponse.json({
      status: 'error',
      message: error instanceof Error ? error.message : `Unknown error testing ${apiNameFormatted}`,
      execution_time_ms: Date.now() - startTime,
      timestamp: new Date().toISOString(),
      error: formatErrorForDisplay(error)
    }, { status: 500 });
  }
}

// Individual test functions
async function runSupabaseTest(): Promise<ApiTest> {
  const testStart = Date.now();
  try {
    const supabase = await createSupabaseServerClient();
    
    // Check connection by making a simple query
    const { data, error } = await supabase
      .from('quote_of_the_day')
      .select('id')
      .limit(1);
    
    if (error) {
      return {
        name: 'Supabase Database',
        status: 'error',
        message: `Failed to connect to Supabase database: ${error.message}`,
        latency: Date.now() - testStart,
        details: {
          error_code: error.code,
          error_details: error.details,
          error_hint: error.hint
        }
      };
    } else {
      return {
        name: 'Supabase Database',
        status: 'success',
        message: 'Successfully connected to Supabase database',
        latency: Date.now() - testStart
      };
    }
  } catch (error) {
    return {
      name: 'Supabase Database',
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error connecting to Supabase database',
      latency: Date.now() - testStart,
      details: formatErrorForDisplay(error)
    };
  }
}

async function runOpenAITest(): Promise<ApiTest> {
  const testStart = Date.now();
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    
    if (!apiKey) {
      return {
        name: 'OpenAI API',
        status: 'error',
        message: 'OpenAI API key is not configured',
        latency: Date.now() - testStart
      };
    }
    
    const openai = new OpenAI({ apiKey });
    
    // Simple test request
    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: 'Hello, this is a test message to verify API connectivity.' }],
      max_tokens: 5,
    });
    
    if (response.choices && response.choices.length > 0) {
      return {
        name: 'OpenAI API',
        status: 'success',
        message: 'Successfully connected to OpenAI API',
        latency: Date.now() - testStart,
        details: {
          model: 'gpt-3.5-turbo',
          response_sample: response.choices[0].message.content
        }
      };
    } else {
      return {
        name: 'OpenAI API',
        status: 'error',
        message: 'OpenAI API returned an empty response',
        latency: Date.now() - testStart,
        details: response
      };
    }
  } catch (error) {
    return {
      name: 'OpenAI API',
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error connecting to OpenAI API',
      latency: Date.now() - testStart,
      details: formatErrorForDisplay(error)
    };
  }
}

async function runExternalFetchTest(): Promise<ApiTest> {
  const testStart = Date.now();
  try {
    // Test the external fetch capabilities
    const testUrl = 'https://jsonplaceholder.typicode.com/posts/1';
    const response = await fetch(testUrl);
    
    if (response.ok) {
      return {
        name: 'External API Fetch',
        status: 'success',
        message: 'Successfully fetched data from external API',
        latency: Date.now() - testStart,
        details: {
          test_url: testUrl
        }
      };
    } else {
      // Try an alternative endpoint if the first one fails
      const fallbackUrl = 'https://httpbin.org/get';
      const fallbackRes = await fetch(fallbackUrl);
      
      if (fallbackRes.ok) {
        return {
          name: 'External API Fetch',
          status: 'success',
          message: 'Successfully fetched data from fallback external API',
          latency: Date.now() - testStart,
          details: {
            test_url: fallbackUrl
          }
        };
      } else {
        return {
          name: 'External API Fetch',
          status: 'error',
          message: 'Failed to fetch from external APIs',
          latency: Date.now() - testStart,
          details: {
            urls_tested: [testUrl, fallbackUrl],
            primary_status: response.status,
            fallback_status: fallbackRes.status
          }
        };
      }
    }
  } catch (error) {
    return {
      name: 'External API Fetch',
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error during external fetch test',
      latency: Date.now() - testStart,
      details: formatErrorForDisplay(error)
    };
  }
}

async function runTwitterTest(): Promise<ApiTest> {
  const testStart = Date.now();
  try {
    // Check if Twitter API tokens are configured
    const twitterApiKey = process.env.TWITTER_API_KEY;
    const twitterApiSecret = process.env.TWITTER_API_SECRET;
    const twitterAccessToken = process.env.TWITTER_ACCESS_TOKEN;
    const twitterAccessSecret = process.env.TWITTER_ACCESS_SECRET;
    
    if (!twitterApiKey || !twitterApiSecret || !twitterAccessToken || !twitterAccessSecret) {
      return {
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
      };
    }
    
    // Since we can't actually test Twitter API without implementing the client,
    // we'll return a placeholder success response
    return {
      name: 'Twitter API',
      status: 'success',
      message: 'Twitter API credentials are configured',
      latency: Date.now() - testStart,
      details: {
        note: "This is a configuration check only. No actual API call was made."
      }
    };
  } catch (error) {
    return {
      name: 'Twitter API',
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error during Twitter API test',
      latency: Date.now() - testStart,
      details: formatErrorForDisplay(error)
    };
  }
} 