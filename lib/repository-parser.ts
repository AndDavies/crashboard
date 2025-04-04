import { Node, Edge } from 'reactflow';

// Type definitions for repository structure
type FileData = {
  name: string;
  path: string;
  type: 'file' | 'dir';
  content?: string;
};

type RepoStructure = {
  files: FileData[];
  routes: Map<string, RouteInfo>;
  apis: Map<string, ApiInfo>;
};

type RouteInfo = {
  path: string;
  apiCalls: ApiCall[];
};

type ApiInfo = {
  path: string;
  method: string;
};

type ApiCall = {
  method: string;
  url: string;
  sourceRoute: string;
};

// GitHub token handling - safely get from environment or session storage
function getGitHubToken(): string | null {
  // For client-side environment variables in Next.js
  if (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_GITHUB_TOKEN) {
    return process.env.NEXT_PUBLIC_GITHUB_TOKEN;
  }
  
  // For server-side
  if (typeof process !== 'undefined' && process.env.GITHUB_TOKEN) {
    return process.env.GITHUB_TOKEN;
  }
  
  // For client-side, check session storage
  if (typeof window !== 'undefined') {
    return sessionStorage.getItem('github_token');
  }
  
  return null;
}

/**
 * Create headers for GitHub API requests with authorization
 */
function getGitHubHeaders() {
  const token = getGitHubToken();
  
  const headers: Record<string, string> = {
    'Accept': 'application/vnd.github.v3+json',
  };
  
  if (token) {
    headers['Authorization'] = `token ${token}`;
  }
  
  return headers;
}

/**
 * Parse a GitHub repository URL to extract owner and repo name
 */
export function parseGitHubUrl(url: string): { owner: string; repo: string } {
  try {
    const parsedUrl = new URL(url);
    
    if (parsedUrl.hostname !== 'github.com') {
      throw new Error('Not a valid GitHub URL');
    }
    
    const pathParts = parsedUrl.pathname.split('/').filter(Boolean);
    
    if (pathParts.length < 2) {
      throw new Error('URL does not contain a valid repository path');
    }
    
    return {
      owner: pathParts[0],
      repo: pathParts[1],
    };
  } catch (error) {
    throw new Error('Invalid GitHub URL');
  }
}

/**
 * Set GitHub token in session storage (client-side only)
 */
export function setGitHubToken(token: string): void {
  if (typeof window !== 'undefined') {
    sessionStorage.setItem('github_token', token);
  }
}

/**
 * Fetch repository structure from GitHub API
 */
export async function fetchRepositoryStructure(owner: string, repo: string): Promise<RepoStructure> {
  try {
    // First, fetch the app directory contents
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/app`, {
      headers: getGitHubHeaders()
    });
    
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Repository or app directory not found');
      }
      if (response.status === 403) {
        throw new Error('GitHub API rate limit exceeded. Please try again later or provide a GitHub token');
      }
      throw new Error(`GitHub API error: ${response.statusText}`);
    }
    
    const contents = await response.json();
    
    // Process the contents recursively
    const files: FileData[] = [];
    const routes = new Map<string, RouteInfo>();
    const apis = new Map<string, ApiInfo>();
    
    // Process directories and files
    await processDirectoryContents(owner, repo, contents, files, '', routes, apis);
    
    // Build relationships between routes and API calls by analyzing code
    await analyzeCodeForApiCalls(files, routes, apis);
    
    return { files, routes, apis };
  } catch (error) {
    console.error('Error fetching repository structure:', error);
    throw new Error((error as Error).message || 'Failed to fetch repository structure');
  }
}

/**
 * Recursively process directory contents
 */
async function processDirectoryContents(
  owner: string, 
  repo: string, 
  contents: any[], 
  files: FileData[],
  currentPath: string,
  routes: Map<string, RouteInfo>,
  apis: Map<string, ApiInfo>
): Promise<void> {
  for (const item of contents) {
    if (item.type === 'dir') {
      // Check if this is a route directory
      const routePath = currentPath ? `${currentPath}/${item.name}` : item.name;
      
      // Skip node_modules, .git, etc.
      if (item.name.startsWith('.') || item.name === 'node_modules') {
        continue;
      }
      
      // Add to files collection
      files.push({
        name: item.name,
        path: item.path,
        type: 'dir'
      });
      
      // For app router, check if this is a route directory
      if (item.path.startsWith('app/') && !item.path.includes('api/')) {
        // This could be a route directory
        const routeInfo: RouteInfo = {
          path: routePath,
          apiCalls: []
        };
        routes.set(routePath, routeInfo);
      }
      
      // For API routes
      if (item.path.includes('api/')) {
        // This is likely an API directory
        const apiPath = `/${item.path.replace('app/', '')}`;
        const apiInfo: ApiInfo = {
          path: apiPath,
          method: 'GET', // Default, will be updated when we analyze code
        };
        apis.set(apiPath, apiInfo);
      }
      
      // Fetch contents of this directory
      const dirResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${item.path}`, {
        headers: getGitHubHeaders()
      });
      
      if (dirResponse.ok) {
        const dirContents = await dirResponse.json();
        await processDirectoryContents(owner, repo, dirContents, files, routePath, routes, apis);
      }
    } else if (item.type === 'file') {
      // Check if this is a page file (page.tsx, route.ts, etc.)
      const isPageFile = item.name === 'page.tsx' || item.name === 'page.jsx' || item.name === 'page.ts' || item.name === 'page.js';
      const isRouteFile = item.name === 'route.tsx' || item.name === 'route.jsx' || item.name === 'route.ts' || item.name === 'route.js';
      const isApiFile = item.path.includes('api/') && (isRouteFile || isPageFile);
      
      // Get file content if it's a page or route file
      let content = '';
      if (isPageFile || isRouteFile) {
        const fileResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${item.path}`, {
          headers: getGitHubHeaders()
        });
        if (fileResponse.ok) {
          const fileData = await fileResponse.json();
          if (fileData.content) {
            content = atob(fileData.content);
          }
        }
      }
      
      // Add to files collection
      files.push({
        name: item.name,
        path: item.path,
        type: 'file',
        content: isPageFile || isRouteFile ? content : undefined
      });
      
      // If this is an API file, extract API info
      if (isApiFile) {
        const apiPath = `/${item.path.replace('app/', '').replace(/\/(page|route)\.(tsx|jsx|ts|js)$/, '')}`;
        
        // Try to determine HTTP method from code
        let method = 'GET';
        if (content) {
          if (content.includes('export async function GET') || content.includes('export function GET')) {
            method = 'GET';
          } else if (content.includes('export async function POST') || content.includes('export function POST')) {
            method = 'POST';
          } else if (content.includes('export async function PUT') || content.includes('export function PUT')) {
            method = 'PUT';
          } else if (content.includes('export async function DELETE') || content.includes('export function DELETE')) {
            method = 'DELETE';
          }
        }
        
        const apiInfo: ApiInfo = {
          path: apiPath,
          method,
        };
        apis.set(apiPath, apiInfo);
      }
    }
  }
}

/**
 * Analyze code files for API calls
 */
async function analyzeCodeForApiCalls(
  files: FileData[],
  routes: Map<string, RouteInfo>,
  apis: Map<string, ApiInfo>
): Promise<void> {
  // For each route with a page file
  for (const file of files) {
    if (!file.content) continue;
    
    // Check if this file belongs to a route
    const routePath = file.path.replace(/\/(page|route)\.(tsx|jsx|ts|js)$/, '').replace('app/', '');
    const route = routes.get(routePath);
    
    if (route) {
      // Look for fetch calls
      const fetchMatches = file.content.matchAll(/fetch\(['"]([^'"]+)['"](,\s*\{[^}]*method:\s*['"]([A-Z]+)['"][^}]*\})?\)/g);
      
      for (const match of Array.from(fetchMatches)) {
        const url = match[1];
        const method = match[3] || 'GET';
        
        // Check if this is an API call to our own API
        if (url.startsWith('/api/')) {
          const apiCall: ApiCall = {
            method,
            url,
            sourceRoute: routePath,
          };
          
          route.apiCalls.push(apiCall);
        }
      }
      
      // Look for axios calls
      const axiosMatches = file.content.matchAll(/axios\.(get|post|put|delete)\(['"]([^'"]+)['"].*\)/g);
      
      for (const match of Array.from(axiosMatches)) {
        const method = match[1].toUpperCase();
        const url = match[2];
        
        // Check if this is an API call to our own API
        if (url.startsWith('/api/')) {
          const apiCall: ApiCall = {
            method,
            url,
            sourceRoute: routePath,
          };
          
          route.apiCalls.push(apiCall);
        }
      }
    }
  }
}

/**
 * Analyze repository structure and generate flowchart data
 */
export function analyzeRepository(repoStructure: RepoStructure): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  
  // Process routes
  let yOffset = 0;
  
  // Add route nodes
  repoStructure.routes.forEach((route, routePath) => {
    nodes.push({
      id: `route-${routePath}`,
      type: 'route',
      position: { x: 100, y: yOffset },
      data: { 
        label: `/${routePath}`, 
        type: 'Route'
      },
    });
    
    yOffset += 120;
  });
  
  // Add API nodes
  let apiYOffset = 0;
  repoStructure.apis.forEach((api, apiPath) => {
    nodes.push({
      id: `api-${apiPath}`,
      type: 'api',
      position: { x: 500, y: apiYOffset },
      data: { 
        label: apiPath, 
        type: `${api.method} Endpoint`
      },
    });
    
    apiYOffset += 120;
  });
  
  // Add edges for API calls
  repoStructure.routes.forEach((route, routePath) => {
    for (const apiCall of route.apiCalls) {
      // Find matching API endpoint
      const apiNode = nodes.find(node => 
        node.type === 'api' && node.data.label === apiCall.url
      );
      
      if (apiNode) {
        edges.push({
          id: `edge-${routePath}-${apiCall.url}`,
          source: `route-${routePath}`,
          target: apiNode.id,
          label: apiCall.method,
          type: 'smoothstep',
          animated: true,
        });
      }
    }
  });
  
  return { nodes, edges };
} 