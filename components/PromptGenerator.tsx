"use client";

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { User } from '@supabase/supabase-js';

interface Prompt {
  id: string;
  user_id: string;
  prompt_text: string;
  tags: string[];
  created_at: string;
}

interface PromptGeneratorProps {
  user: User;
}

export default function PromptGenerator({ user }: PromptGeneratorProps) {
  const [role, setRole] = useState<string>('');
  const [task, setTask] = useState<string>('');
  const [context, setContext] = useState<string>('');
  const [tone, setTone] = useState<string>('');
  const [constraints, setConstraints] = useState<string>('');
  const [output, setOutput] = useState<string>('');
  const [tags, setTags] = useState<string>('');
  const [generatedPrompt, setGeneratedPrompt] = useState<string>('');
  const [refinedPrompt, setRefinedPrompt] = useState<string>('');
  const [savedPrompts, setSavedPrompts] = useState<Prompt[]>([]);
  const [searchTag, setSearchTag] = useState<string>('');

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  useEffect(() => {
    fetchSavedPrompts();
  }, []);

  const handleGenerate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const prompt = `${role ? `You are a ${role}. ` : ''}Your task is to ${task}. ${context ? `Context: ${context}. ` : ''}${tone ? `Use a ${tone} tone. ` : ''}${constraints ? `Constraints: ${constraints}. ` : ''}${output ? `Provide the output as ${output}.` : ''}`.trim();
    setGeneratedPrompt(prompt);
    setRefinedPrompt('');
  };

  const handleRefine = async () => {
    if (!generatedPrompt) return;

    const response = await fetch('/api/refine-prompt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: generatedPrompt }),
    });

    if (response.ok) {
      const { refined }: { refined: string } = await response.json();
      setRefinedPrompt(refined);
      toast.success('Prompt refined successfully!');
    } else {
      toast.error('Failed to refine prompt.');
    }
  };

  const handleSave = async () => {
    const promptToSave = refinedPrompt || generatedPrompt;
    if (!promptToSave) return;

    const tagArray = tags.split(',').map(tag => tag.trim()).filter(Boolean);
    const { error } = await supabase.from('prompts').insert({
      user_id: user.id,
      prompt_text: promptToSave,
      tags: tagArray,
    });

    if (error) {
      toast.error('Failed to save prompt: ' + error.message);
    } else {
      toast.success('Prompt saved successfully!');
      fetchSavedPrompts();
    }
  };

  const fetchSavedPrompts = async () => {
    const { data, error } = await supabase
      .from('prompts')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      toast.error('Failed to fetch prompts: ' + error.message);
    } else {
      setSavedPrompts(data as Prompt[]);
    }
  };

  const handleSearch = () => {
    const filtered = savedPrompts.filter(prompt =>
      prompt.tags.some(tag => tag.toLowerCase().includes(searchTag.toLowerCase()))
    );
    setSavedPrompts(filtered);
  };

  return (
    <div className="space-y-6">
      <form onSubmit={handleGenerate} className="space-y-4">
        <div>
          <Label htmlFor="role">Role</Label>
          <Input id="role" value={role} onChange={(e) => setRole(e.target.value)} placeholder="e.g., Python expert" className="w-full" />
        </div>
        <div>
          <Label htmlFor="task">Task</Label>
          <Input id="task" value={task} onChange={(e) => setTask(e.target.value)} placeholder="e.g., write a script" required className="w-full" />
        </div>
        <div>
          <Label htmlFor="context">Context</Label>
          <Textarea id="context" value={context} onChange={(e) => setContext(e.target.value)} placeholder="e.g., for my dashboard" className="w-full" />
        </div>
        <div>
          <Label htmlFor="tone">Tone</Label>
          <Input id="tone" value={tone} onChange={(e) => setTone(e.target.value)} placeholder="e.g., casual" className="w-full" />
        </div>
        <div>
          <Label htmlFor="constraints">Constraints</Label>
          <Input id="constraints" value={constraints} onChange={(e) => setConstraints(e.target.value)} placeholder="e.g., under 500 words" className="w-full" />
        </div>
        <div>
          <Label htmlFor="output">Output Format</Label>
          <Input id="output" value={output} onChange={(e) => setOutput(e.target.value)} placeholder="e.g., markdown" className="w-full" />
        </div>
        <div>
          <Label htmlFor="tags">Tags (comma-separated)</Label>
          <Input id="tags" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="e.g., coding, blog" className="w-full" />
        </div>
        <Button type="submit" className="w-full sm:w-auto">Generate Prompt</Button>
      </form>

      {generatedPrompt && (
        <div className="mt-6">
          <h3 className="text-lg font-semibold">Generated Prompt:</h3>
          <pre className="bg-gray-100 dark:bg-gray-800 p-4 rounded whitespace-pre-wrap text-sm">{generatedPrompt}</pre>
          <div className="mt-2 space-x-2">
            <Button onClick={handleRefine}>Refine with AI</Button>
            <Button onClick={handleSave} variant="secondary">Save Prompt</Button>
          </div>
        </div>
      )}

      {refinedPrompt && (
        <div className="mt-6">
          <h3 className="text-lg font-semibold">Refined Prompt:</h3>
          <pre className="bg-gray-100 dark:bg-gray-800 p-4 rounded whitespace-pre-wrap text-sm">{refinedPrompt}</pre>
          <Button onClick={handleSave} className="mt-2" variant="secondary">Save Refined Prompt</Button>
        </div>
      )}

      <div className="mt-8">
        <h3 className="text-lg font-semibold">Saved Prompts</h3>
        <div className="flex flex-col sm:flex-row gap-2 mb-4">
          <Input value={searchTag} onChange={(e) => setSearchTag(e.target.value)} placeholder="Search by tag" className="w-full sm:w-64" />
          <Button onClick={handleSearch} className="w-full sm:w-auto">Search</Button>
          <Button onClick={fetchSavedPrompts} variant="outline" className="w-full sm:w-auto">Refresh</Button>
        </div>
        <div className="space-y-4">
          {savedPrompts.map(prompt => (
            <div key={prompt.id} className="p-4 border rounded-lg bg-white dark:bg-gray-900">
              <p className="whitespace-pre-wrap text-sm">{prompt.prompt_text}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Tags: {prompt.tags.join(', ')}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Saved: {new Date(prompt.created_at).toLocaleString()}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}