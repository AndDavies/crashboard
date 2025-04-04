"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ReloadIcon, LightningBoltIcon, CheckCircledIcon } from "@radix-ui/react-icons";
import RepositoryFlowchart from "@/components/RepositoryFlowchart";
import { parseGitHubUrl, fetchRepositoryStructure, analyzeRepository } from "@/lib/repository-parser";

type RepositoryData = {
  nodes: Array<{
    id: string;
    type: string;
    data: { label: string; type: string };
    position: { x: number; y: number };
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    label?: string;
  }>;
};

// Example repositories with Next.js App Router
const EXAMPLE_REPOS = [
  {
    name: "Next.js App Router Examples",
    url: "https://github.com/vercel/app-playground",
    description: "Official App Router examples from Vercel"
  },
  {
    name: "Next.js Commerce",
    url: "https://github.com/vercel/commerce",
    description: "E-commerce site built with App Router and Server Components"
  },
  {
    name: "Next.js Dashboard",
    url: "https://github.com/vercel/next-learn",
    description: "The dashboard app from Next.js learning course"
  }
];

export default function RepositoryVisualizer() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [repositoryData, setRepositoryData] = useState<RepositoryData | null>(null);
  const [analyzedRepo, setAnalyzedRepo] = useState<string | null>(null);

  const analyzeRepo = async (repoUrl: string) => {
    setLoading(true);
    setError(null);
    setRepositoryData(null);
    setUrl(repoUrl);

    try {
      // Parse the GitHub URL
      const { owner, repo } = parseGitHubUrl(repoUrl);
      if (!owner || !repo) {
        throw new Error("Invalid GitHub repository URL");
      }

      setAnalyzedRepo(`${owner}/${repo}`);

      // Fetch repository structure
      const repoStructure = await fetchRepositoryStructure(owner, repo);
      
      if (!repoStructure.routes.size && !repoStructure.apis.size) {
        throw new Error("No App Router routes or API endpoints found in this repository");
      }
      
      // Analyze repository to generate flowchart data
      const flowchartData = analyzeRepository(repoStructure);
      
      if (!flowchartData.nodes.length) {
        throw new Error("No visualization data could be generated from this repository");
      }
      
      setRepositoryData(flowchartData);
    } catch (err) {
      console.error("Analysis error:", err);
      setError((err as Error).message || "Failed to analyze repository");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await analyzeRepo(url);
  };

  const handleExampleClick = async (exampleUrl: string) => {
    await analyzeRepo(exampleUrl);
  };

  return (
    <div className="space-y-8">
      {!loading && !repositoryData && (
        <>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="flex flex-col sm:flex-row gap-3">
              <Input
                placeholder="https://github.com/username/repository"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="flex-grow"
                required
              />
              <Button type="submit" className="whitespace-nowrap">
                Visualize
              </Button>
            </div>
            
            <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-500">
              <CheckCircledIcon className="h-4 w-4" />
              <span>GitHub API authentication enabled</span>
            </div>
            
            {error && (
              <Alert variant="destructive" className="mt-4">
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </form>
          
          <div className="pt-6 border-t">
            <h3 className="text-lg font-medium mb-4">Try these examples:</h3>
            <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
              {EXAMPLE_REPOS.map((example) => (
                <button
                  key={example.url}
                  onClick={() => handleExampleClick(example.url)}
                  className="p-4 border rounded-lg text-left hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-2 font-medium text-sm">
                    <LightningBoltIcon className="h-4 w-4 text-blue-500" />
                    {example.name}
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">{example.description}</p>
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {loading && (
        <div className="flex flex-col items-center justify-center py-20">
          <ReloadIcon className="h-8 w-8 animate-spin text-primary mb-4" />
          <p className="text-muted-foreground">Analyzing repository structure...</p>
          {analyzedRepo && (
            <p className="text-sm font-medium mt-2">Repository: {analyzedRepo}</p>
          )}
          <p className="text-xs text-muted-foreground mt-2">This may take a moment depending on repository size</p>
        </div>
      )}

      {repositoryData && !loading && (
        <div className="animate-in fade-in-50 duration-500">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h2 className="text-2xl font-semibold">Repository Structure</h2>
              {analyzedRepo && (
                <p className="text-sm text-muted-foreground mt-1">{analyzedRepo}</p>
              )}
            </div>
            <Button variant="outline" onClick={() => setRepositoryData(null)}>
              Analyze Another
            </Button>
          </div>
          <RepositoryFlowchart data={repositoryData} />
          
          <div className="mt-6 flex flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
            <p>
              Flow diagram shows routes (blue) and their API connections (green)
            </p>
            <p className="text-xs">
              You can zoom, pan, and click on nodes to explore the repository structure
            </p>
          </div>
        </div>
      )}
    </div>
  );
} 