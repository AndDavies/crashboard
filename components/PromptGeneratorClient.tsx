"use client";

import React from 'react';
import { useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { useRouter } from 'next/navigation';
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { 
  Sparkles,
  PlusCircle,
  Target,
  PenTool,
  Sprout,
  Hash,
  Tag,
  Lightbulb,
  Wand2,
  Save,
  Trash2,
  Copy,
  Info,
  BookOpen,
  Code2,
  PencilLine,
  BarChart3,
  Search
} from 'lucide-react';

// Define available tasks and their corresponding icons
const tasks = [
  { value: 'pet-travel', label: 'Pet Travel Blog', icon: BookOpen },
  { value: 'coding', label: 'Coding', icon: Code2 },
  { value: 'analytics', label: 'Data Analytics', icon: BarChart3 },
  { value: 'scraping', label: 'Web Scraping', icon: Search }
];

// Define prompt styles
const promptStyles = [
  { value: 'quick', label: 'Quick & Specific', description: 'Short, actionable tasks' },
  { value: 'conceptual', label: 'Conceptual & Informative', description: 'Deeper, educational ideas' }
];

// Define topic seed suggestions for each task
const topicSeedSuggestions = {
  'pet-travel': ['pet safety', 'travel tips', 'hotel reviews', 'destination guides'],
  'coding': ['API calls', 'error handling', 'data structures', 'testing'],
  'analytics': ['trend analysis', 'customer insights', 'performance metrics', 'data visualization'],
  'scraping': ['price monitoring', 'content extraction', 'data cleaning', 'rate limiting']
};

type Prompt = {
  id: number;
  context: string;
  type: string;
  seed?: string | null;
  prompt: string;
  created_at: string;
};

type PromptGeneratorClientProps = {
  initialPrompts: Prompt[];
};

export default function PromptGeneratorClient({ initialPrompts }: PromptGeneratorClientProps) {
  const [selectedTask, setSelectedTask] = useState('');
  const [selectedStyle, setSelectedStyle] = useState('quick');
  const [numberSeed, setNumberSeed] = useState('');
  const [topicSeed, setTopicSeed] = useState('');
  const [generatedPrompt, setGeneratedPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedPrompts, setSavedPrompts] = useState<Prompt[]>(initialPrompts);
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  const router = useRouter();

  const handleSuggestTopic = () => {
    if (!selectedTask) return;
    const suggestions = topicSeedSuggestions[selectedTask as keyof typeof topicSeedSuggestions];
    if (suggestions) {
      const randomSuggestion = suggestions[Math.floor(Math.random() * suggestions.length)];
      setTopicSeed(randomSuggestion);
    }
  };

  const handleGenerate = async () => {
    if (!selectedTask) {
      setError('Please select a task');
      return;
    }

    setIsGenerating(true);
    setError(null);

    try {
      const seed = numberSeed || topicSeed || null;
      const response = await fetch('/api/prompts/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          context: selectedTask,
          type: selectedStyle,
          seed
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate prompt');
      }

      const data = await response.json();
      setGeneratedPrompt(data.prompt);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSave = async () => {
    if (!generatedPrompt.trim()) {
      setError('No prompt to save');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('You must be logged in to save prompts');
      }

      const { data, error } = await supabase
        .from('prompts')
        .insert([
          {
            user_id: user.id,
            context: selectedTask,
            type: selectedStyle,
            seed: numberSeed || topicSeed || null,
            prompt: generatedPrompt,
          },
        ])
        .select()
        .single();

      if (error) throw error;

      setSavedPrompts([data, ...savedPrompts]);
      setGeneratedPrompt('');
      setSelectedTask('');
      setNumberSeed('');
      setTopicSeed('');
      router.refresh();
      toast({ title: "Saved!", description: "Prompt saved successfully." });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save prompt');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      const { error } = await supabase
        .from('prompts')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setSavedPrompts(savedPrompts.filter(prompt => prompt.id !== id));
      router.refresh();
      toast({ title: "Deleted", description: "Prompt removed." });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete prompt');
    }
  };

  const handleCopyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
      .then(() => toast({ title: "Copied!", description: "Prompt copied to clipboard." }))
      .catch(err => toast({ title: "Error", description: "Failed to copy text.", variant: "destructive" }));
  };

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold flex items-center justify-center gap-2">
          <Sparkles className="w-8 h-8 text-purple-500" />
          Prompt Generator
        </h1>
        <p className="text-muted-foreground">
          Craft smart prompts to supercharge your work! Pick a task, choose a style, and use seeds to shape your ideas—numbers for consistency, words for focus.
        </p>
      </div>

      <Card className="bg-white/50 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PlusCircle className="w-5 h-5 text-blue-500" />
            Generate New Prompt
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Task Selection */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Target className="w-4 h-4" />
              What's Your Task?
            </Label>
            <Select value={selectedTask} onValueChange={setSelectedTask}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a task..." />
              </SelectTrigger>
              <SelectContent>
                {tasks.map((task) => {
                  const Icon = task.icon;
                  return (
                    <SelectItem key={task.value} value={task.value}>
                      <div className="flex items-center gap-2">
                        <Icon className="w-4 h-4" />
                        {task.label}
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">
              Select the task you're tackling to get a prompt that matches your goal.
            </p>
          </div>

          {/* Prompt Style */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <PenTool className="w-4 h-4" />
              Prompt Style
            </Label>
            <Select value={selectedStyle} onValueChange={setSelectedStyle}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a style..." />
              </SelectTrigger>
              <SelectContent>
                {promptStyles.map((style) => (
                  <SelectItem key={style.value} value={style.value}>
                    {style.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">
              Go for 'Quick & Specific' for short, actionable tasks, or 'Conceptual & Informative' for deeper, educational ideas.
            </p>
            <div className="space-y-1 text-sm text-muted-foreground">
              <p>Quick & Specific: "Write a 150-word pet travel blog on hotel deals."</p>
              <p>Conceptual & Informative: "Explain how to analyze pet travel trends with Python."</p>
            </div>
          </div>

          {/* Seeds Section */}
          <div className="space-y-4">
            <Label className="flex items-center gap-2">
              <Sprout className="w-4 h-4" />
              Add a Seed (Optional)
            </Label>
            
            {/* Number Seed */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2 text-sm">
                <Hash className="w-4 h-4" />
                Number Seed (for consistency)
              </Label>
              <Input
                value={numberSeed}
                onChange={(e) => setNumberSeed(e.target.value)}
                placeholder="e.g., 42"
              />
              <p className="text-sm text-muted-foreground">
                Pick a number (like 42) to get the same prompt every time.
              </p>
            </div>

            {/* Topic Seed */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-2 text-sm">
                  <Tag className="w-4 h-4" />
                  Topic Seed (for focus)
                </Label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleSuggestTopic}
                  className="text-sm"
                >
                  <Lightbulb className="w-4 h-4 mr-1" />
                  Suggest a Topic
                </Button>
              </div>
              <Input
                value={topicSeed}
                onChange={(e) => setTopicSeed(e.target.value)}
                placeholder="e.g., pet safety, web scraping"
              />
              <p className="text-sm text-muted-foreground">
                Add a word (like 'pet safety') to zero in on that idea.
              </p>
            </div>
          </div>

          {error && (
            <div className="text-red-500 text-sm">{error}</div>
          )}

          <Button
            onClick={handleGenerate}
            disabled={isGenerating}
            className="w-full"
          >
            <Wand2 className="w-4 h-4 mr-2" />
            {isGenerating ? 'Creating...' : 'Create My Prompt!'}
          </Button>
        </CardContent>
      </Card>

      {generatedPrompt && (
        <Card className="bg-white/50 backdrop-blur-sm">
          <CardHeader>
            <CardTitle>Generated Prompt</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-gray-50 p-4 rounded-md">
              <pre className="whitespace-pre-wrap text-sm">{generatedPrompt}</pre>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={handleSave}
                disabled={isSaving}
                className="flex-1"
              >
                <Save className="w-4 h-4 mr-2" />
                {isSaving ? 'Saving...' : 'Save Prompt'}
              </Button>
              <Button
                variant="outline"
                onClick={() => handleCopyToClipboard(generatedPrompt)}
              >
                <Copy className="w-4 h-4 mr-2" />
                Copy
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="bg-white/50 backdrop-blur-sm">
        <CardHeader>
          <CardTitle>Saved Prompts</CardTitle>
        </CardHeader>
        <CardContent>
          {savedPrompts.length === 0 ? (
            <p className="text-muted-foreground text-center">No saved prompts yet</p>
          ) : (
            <div className="space-y-4">
              {savedPrompts.map((prompt) => (
                <div key={prompt.id} className="border rounded-lg p-4 space-y-3">
                  <div className="flex justify-between items-start">
                    <div className="flex items-center">
                      {tasks.find(t => t.value === prompt.context)?.icon && (
                        <div className="flex items-center gap-2">
                          {React.createElement(tasks.find(t => t.value === prompt.context)?.icon!, { className: "w-4 h-4" })}
                          <span className="font-medium capitalize">
                            {tasks.find(t => t.value === prompt.context)?.label}
                          </span>
                        </div>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(prompt.id)}
                      className="text-red-500 hover:text-red-700"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">
                      <strong>Style:</strong> {promptStyles.find(s => s.value === prompt.type)?.label}
                    </p>
                    {prompt.seed && (
                      <p className="text-sm text-muted-foreground">
                        <strong>Seed:</strong> {prompt.seed}
                        {!isNaN(Number(prompt.seed)) ? (
                          <Hash className="w-3 h-3 inline ml-1" />
                        ) : (
                          <Tag className="w-3 h-3 inline ml-1" />
                        )}
                      </p>
                    )}
                    <div className="bg-gray-50 p-3 rounded-md">
                      <pre className="whitespace-pre-wrap text-sm">{prompt.prompt}</pre>
                    </div>
                    <div className="flex justify-between items-center text-xs text-muted-foreground">
                      <span>
                        Created: {new Date(prompt.created_at).toLocaleString()}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCopyToClipboard(prompt.prompt)}
                      >
                        <Copy className="w-3 h-3 mr-1" />
                        Copy
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
} 