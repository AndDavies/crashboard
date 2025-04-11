/**
 * API Test Utility Functions
 * 
 * This file contains helper functions for API testing and diagnostics.
 */

interface ApiConfigCheck {
  name: string;
  configKey: string;
  isConfigured: boolean;
  value?: string;
}

/**
 * Check if environment variables required for an API are configured
 * @param apiName The name of the API service
 * @param requiredEnvVars Array of required environment variable keys
 * @returns Configuration status object
 */
export function checkApiConfiguration(apiName: string, requiredEnvVars: string[]): ApiConfigCheck[] {
  return requiredEnvVars.map(envVar => {
    const value = process.env[envVar];
    const isConfigured = !!value;
    
    return {
      name: `${apiName} - ${envVar}`,
      configKey: envVar,
      isConfigured,
      // Only include non-sensitive values or redacted forms of sensitive values
      value: isConfigured 
        ? envVar.toLowerCase().includes('key') || envVar.toLowerCase().includes('secret') 
          ? `${value.substring(0, 3)}...${value.substring(value.length - 3)}` 
          : value
        : undefined
    };
  });
}

/**
 * Format an error object for safe display
 * @param error Any error object
 * @returns Sanitized error details object
 */
export function formatErrorForDisplay(error: any): Record<string, any> {
  if (!error) return { message: 'Unknown error (null or undefined)' };
  
  // Handle Error objects
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    };
  }
  
  // Handle Supabase errors
  if (typeof error === 'object' && 'code' in error && 'message' in error) {
    return {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: (error as any).hint
    };
  }
  
  // Handle other object errors
  if (typeof error === 'object') {
    // Remove any potentially sensitive information
    const sanitized = { ...error };
    
    // Remove potentially sensitive fields
    ['password', 'token', 'secret', 'key', 'authorization', 'auth'].forEach(field => {
      if (field in sanitized) {
        sanitized[field] = '[REDACTED]';
      }
    });
    
    return sanitized;
  }
  
  // For primitive types
  return { message: String(error) };
}

/**
 * Safely extracts the hostname from a URL string
 * @param url URL string to parse
 * @returns Hostname or original URL if parsing fails
 */
export function getSafeHostname(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch (error) {
    return url;
  }
}

/**
 * Generate a diagnostic summary for troubleshooting
 * @param testResults Array of test results
 * @returns Diagnostic summary object
 */
export function generateDiagnosticSummary(testResults: any[]): {
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
    .map(test => test.latency);
    
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