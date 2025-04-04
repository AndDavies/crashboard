import { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeftIcon, GitHubLogoIcon } from "@radix-ui/react-icons";
import RepositoryVisualizer from "@/components/RepositoryVisualizer";

export const metadata: Metadata = {
  title: "Repository Visualizer",
  description: "Visualize GitHub repository structure and API calls",
};

export default function VisualizePage() {
  return (
    <div className="container mx-auto py-6">
      <div className="flex justify-between items-center mb-8">
        <Link href="/">
          <Button variant="ghost" size="sm" className="flex items-center gap-2">
            <ArrowLeftIcon className="h-4 w-4" />
            <span>Back to Dashboard</span>
          </Button>
        </Link>
        <Link 
          href="https://github.com" 
          target="_blank" 
          rel="noopener noreferrer"
        >
          <Button variant="outline" size="sm" className="flex items-center gap-2">
            <GitHubLogoIcon className="h-4 w-4" />
            <span>Open GitHub</span>
          </Button>
        </Link>
      </div>
      
      <h1 className="text-3xl font-bold mb-6 text-center">GitHub Repository Visualizer</h1>
      <p className="text-muted-foreground text-center mb-8">
        Visualize the structure and API calls of a GitHub repository
      </p>
      <RepositoryVisualizer />
      
      <div className="mt-12 pt-6 border-t">
        <h2 className="text-xl font-semibold mb-4">How it works</h2>
        <div className="space-y-4 text-muted-foreground">
          <p>
            This tool analyzes GitHub repositories that use Next.js App Router structure. 
            Enter a GitHub repository URL above and the tool will:
          </p>
          <ol className="list-decimal list-inside space-y-2 pl-4">
            <li>Fetch the repository structure via the GitHub API</li>
            <li>Analyze the <code className="text-xs bg-muted p-1 rounded">app/</code> directory to identify routes and API endpoints</li>
            <li>Parse code to detect API calls between routes and endpoints</li>
            <li>Generate an interactive visualization of the connection between routes and APIs</li>
          </ol>
          <p className="text-sm italic mt-6">
            Note: The GitHub API has rate limits for unauthenticated requests. If you encounter errors, 
            try again later or use a different repository.
          </p>
        </div>
      </div>
    </div>
  );
} 