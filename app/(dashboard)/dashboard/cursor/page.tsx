"use client";

import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { CopyIcon } from "lucide-react";
import { toast } from "react-hot-toast";

export default function CursorPromptPage() {
  const [inputType, setInputType] = useState<"task" | "code">("task");
  const [task, setTask] = useState("");
  const [code, setCode] = useState("");
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleGenerate = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/generate/openai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task, code }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Something went wrong");
      }

      setPrompt(data.result);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      toast.success("Prompt copied to clipboard!");
    } catch {
      toast.error("Failed to copy");
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6 py-8">
      <h1 className="text-2xl font-bold">Cursor AI Prompt Optimizer</h1>

      <ToggleGroup
        type="single"
        value={inputType}
        onValueChange={(val: string | undefined) => {
          if (val === "task" || val === "code") setInputType(val);
        }}
      >
        <ToggleGroupItem value="task">Task</ToggleGroupItem>
        <ToggleGroupItem value="code">Code</ToggleGroupItem>
      </ToggleGroup>

      {inputType === "task" && (
        <div>
          <Label htmlFor="task">Describe your task</Label>
          <Textarea
            id="task"
            rows={6}
            placeholder="e.g. The reminders route is not saving reminders to the database. Please review."
            value={task}
            onChange={(e) => setTask(e.target.value)}
          />
        </div>
      )}

      {inputType === "code" && (
        <div>
          <Label htmlFor="code">Paste your code</Label>
          <Textarea
            id="code"
            rows={10}
            placeholder="Paste your TypeScript/React code here."
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </div>
      )}

      <Button onClick={handleGenerate} disabled={loading}>
        {loading ? "Generating..." : "Generate Prompt"}
      </Button>

      {error && <p className="text-red-500 font-medium">{error}</p>}

      {prompt && (
        <Card>
          <CardContent className="space-y-2 p-4">
            <div className="flex justify-between items-center">
              <Label>Generated Prompt</Label>
              <Button variant="outline" size="sm" onClick={handleCopy}>
                <CopyIcon className="w-4 h-4 mr-2" />
                Copy
              </Button>
            </div>
            <pre className="whitespace-pre-wrap bg-muted p-4 rounded-md text-sm overflow-auto">
              {prompt}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
