# API Diagnostics Tool

This tool provides comprehensive diagnostics for all API integrations used in the application. It helps identify issues with external API connections, authentication, and configuration.

## Features

- **Real-time API Testing**: Tests all API endpoints and services used by the application
- **Detailed Diagnostics**: Provides detailed error information and troubleshooting guidance
- **Response Time Monitoring**: Tracks API response times to identify performance issues
- **Configuration Verification**: Checks that all required API credentials are properly configured
- **Error Handling**: Robust error handling with clear, actionable error messages

## Supported API Services

The diagnostic tool tests the following API integrations:

1. **Supabase Database**
   - Main application database connection
   - Table access and permissions
   - Blog database connection (if configured)

2. **OpenAI API**
   - API key validation
   - Basic completion testing
   - Title generation service

3. **Twitter API**
   - Authentication configuration
   - Endpoint connectivity

4. **External API Fetch Capabilities**
   - General HTTP fetch functionality
   - Response handling

## Usage

To use the API diagnostics tool:

1. Navigate to `/dashboard/api-test` in your browser
2. The tests will run automatically on page load
3. Click "Run Tests" to manually trigger a new test run
4. View results in the tabbed interface:
   - **Overview**: High-level summary of API status
   - **API Details**: Detailed information about each API connection
   - **Raw Data**: Complete JSON response for developer use

## Development

The API test functionality consists of the following components:

- `route.ts`: Server-side API route that performs the actual tests
- `utils.ts`: Utility functions for API testing and error handling
- `ApiTestClient.tsx`: Client-side component that displays the test results
- `page.tsx`: Page component that integrates the client component

### Adding a New API Test

To add a test for a new API integration:

1. Create a new test function in `route.ts` following the pattern of existing tests
2. Add the function call in the main GET handler
3. Update the client component if necessary to display any new data

### Error Handling

The diagnostic tool implements comprehensive error handling:

- All errors are caught and formatted for safe display
- Sensitive information (keys, tokens) is automatically redacted
- Detailed error information is provided where possible to aid troubleshooting

## Security Considerations

- API keys and sensitive credentials are never exposed in client-side code
- Error details are only shown in the diagnostic view, which requires authentication
- Test results are not persisted to avoid storing sensitive error information

## Troubleshooting Common Issues

### "API Key Not Configured" Errors

If you see "not configured" errors, check that the appropriate environment variables are set:

- OpenAI API: `OPENAI_API_KEY`  
- Twitter API: `TWITTER_CLIENT_ID` and `TWITTER_CLIENT_SECRET`
- Supabase Blog: `NEXT_PUBLIC_SUPABASE_BLOG_URL` and `NEXT_PUBLIC_SUPABASE_BLOG_ANON_KEY`

### Connection Timeouts

If API tests are timing out:

1. Check network connectivity
2. Verify that the API services are operational
3. Check if rate limits have been exceeded

### Authentication Errors

For authentication-related errors:

1. Verify that API keys are valid and not expired
2. Check that the authenticated user has appropriate permissions
3. Ensure OAuth configurations are correct for services using OAuth

## Feedback and Contributions

If you encounter issues or have suggestions for improving the API diagnostics tool, please open an issue or submit a pull request. 