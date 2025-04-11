# API Test Endpoint

This endpoint provides programmatic access to API diagnostics for the application. It checks the health and connectivity of various external API services used by the application.

## Endpoint

```
GET /api/api-test
```

## Response Format

The endpoint returns a JSON response with the following structure:

```json
{
  "status": "success" | "warning" | "error",
  "message": "Human-readable status message",
  "execution_time_ms": 1234,
  "timestamp": "ISO date string",
  "summary": {
    "success": 3,
    "warning": 1,
    "error": 0,
    "notConfigured": 0,
    "totalServices": 4,
    "averageLatency": 123.45
  },
  "results": [
    {
      "name": "Service Name",
      "status": "success" | "warning" | "error",
      "message": "Status details",
      "latency": 123,
      "details": { /* Service-specific details */ }
    },
    // Additional service results...
  ]
}
```

## Services Tested

1. **Supabase Database** - Tests connectivity to the primary database
2. **OpenAI API** - Tests authentication and basic completion functionality
3. **External API Fetch** - Tests the application's ability to make external HTTP requests

## Using the API

### From the Browser

You can directly call the API from the browser:

```
https://yourdomain.com/api/api-test
```

### From JavaScript

```javascript
async function runApiTest() {
  const response = await fetch('/api/api-test');
  const results = await response.json();
  console.log(results);
}
```

### From Node.js

```javascript
const fetch = require('node-fetch');

async function runApiTest() {
  const response = await fetch('https://yourdomain.com/api/api-test');
  const results = await response.json();
  console.log(results);
}
```

## Error Handling

The API applies comprehensive error handling to ensure it always returns a valid response, even when services fail:

- If a service test fails, the overall status will be "error" but the API will still return a 200 OK response
- If the API itself encounters an error, it will return a 500 Internal Server Error with details
- Service-specific errors are contained within each result object's "details" field

## Security Considerations

- The API automatically redacts sensitive information from error responses
- API keys and credentials are never exposed in the response
- Consider adding authentication to restrict access to the API in production

## Extending the API

To add tests for additional services:

1. Create a new test function in `route.ts` following the pattern of existing tests
2. Add a call to your new function in the main GET handler
3. Ensure your test follows the same error handling patterns as the existing tests 