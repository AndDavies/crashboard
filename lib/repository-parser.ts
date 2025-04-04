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
 * This is only used for UI state management now
 */
export function setGitHubToken(token: string): void {
  if (typeof window !== 'undefined') {
    sessionStorage.setItem('github_token', token);
  }
}

/**
 * Fetch repository structure using server API
 */
export async function fetchRepositoryStructure(owner: string, repo: string): Promise<RepoStructure> {
  try {
    const repoUrl = `https://github.com/${owner}/${repo}`;

    // Call our secure server API route instead of direct GitHub API
    const response = await fetch('/api/github', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ repoUrl }),
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `Error: ${response.statusText}`);
    }
    
    const { data } = await response.json();
    
    // Process the response data
    // Note: Map doesn't serialize in JSON, so server sends the data as objects
    // We need to reconstruct the Maps from the plain objects
    const routes = new Map<string, RouteInfo>();
    const apis = new Map<string, ApiInfo>();
    
    // Convert routes from plain object to Map
    if (data.routes) {
      Object.entries(data.routes).forEach(([key, value]) => {
        const routeInfo = value as RouteInfo;
        routes.set(key, routeInfo);
      });
    }
    
    // Convert apis from plain object to Map
    if (data.apis) {
      Object.entries(data.apis).forEach(([key, value]) => {
        const apiInfo = value as ApiInfo;
        apis.set(key, apiInfo);
      });
    }
    
    // Construct the final structure
    const repoStructure: RepoStructure = {
      files: data.files || [],
      routes,
      apis
    };
    
    return repoStructure;
  } catch (error) {
    console.error('Error fetching repository structure:', error);
    throw new Error((error as Error).message || 'Failed to fetch repository structure');
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