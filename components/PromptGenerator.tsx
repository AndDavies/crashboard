"use client";

import { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { User } from '@supabase/supabase-js';

interface Prompt {
  id: string;
  user_id: string;
  prompt_text: string;
  created_at: string;
  prompt_tags: { tag_id: string; tags: { name: string } }[]; // Updated to reflect join
}

interface Tag {
  id: string;
  name: string;
  user_id: string;
  created_at: string;
}

interface PromptGeneratorProps {
  user: User;
}

export default function PromptGenerator({ user }: PromptGeneratorProps) {
  const [role, setRole] = useState<string>('');
  const [task, setTask] = useState<string>('');
  const [context, setContext] = useState<string>('');
  const [articleDetails, setArticleDetails] = useState<string>('');
  const [tone, setTone] = useState<string>('');
  const [constraints, setConstraints] = useState<string>('');
  const [output, setOutput] = useState<string>('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState<string>('');
  const [availableTags, setAvailableTags] = useState<Tag[]>([]);
  const [generatedPrompt, setGeneratedPrompt] = useState<string>('');
  const [refinedPrompt, setRefinedPrompt] = useState<string>('');
  const [savedPrompts, setSavedPrompts] = useState<Prompt[]>([]);
  const [searchTag, setSearchTag] = useState<string>('');

  const supabase = createClient();

  useEffect(() => {
    fetchTags();
    fetchSavedPrompts();
  }, []);

  const fetchTags = async () => {
    const { data, error } = await supabase
      .from('tags')
      .select('*')
      .eq('user_id', user.id)
      .order('name', { ascending: true });

    if (error) {
      toast.error('Failed to fetch tags: ' + error.message);
      console.error('Fetch tags error:', error);
    } else {
      setAvailableTags(data as Tag[]);
    }
  };

  const fetchSavedPrompts = async () => {
    const { data, error } = await supabase
      .from('prompts')
      .select('*, prompt_tags(tag_id, tags(name))')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      toast.error('Failed to fetch prompts: ' + error.message);
      console.error('Fetch prompts error:', error);
    } else {
      setSavedPrompts(data as Prompt[]);
    }
  };

  const handleGenerate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const prompt = `${role ? `You are a ${role}. ` : ''}Your task is to ${task}. ${context ? `Context: ${context}. ` : ''}${articleDetails ? `Article Details: ${articleDetails}. ` : ''}${tone ? `Use a ${tone} tone. ` : ''}${constraints ? `Constraints: ${constraints}. ` : ''}${output ? `Provide the output as ${output}.` : ''}`.trim();
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
      console.error('Refine error:', await response.text());
    }
  };

  const handleSave = async () => {
    const promptToSave = refinedPrompt || generatedPrompt;
    if (!promptToSave) return;

    // Step 1: Insert the prompt
    const { data: promptData, error: promptError } = await supabase
      .from('prompts')
      .insert({ user_id: user.id, prompt_text: promptToSave })
      .select()
      .single();

    if (promptError) {
      toast.error('Failed to save prompt: ' + promptError.message);
      console.error('Save prompt error:', promptError);
      return;
    }

    // Step 2: Insert new tags and get all tag IDs
    const tagIds: string[] = [];
    for (const tagName of tags) {
      const { data: existingTag, error: tagError } = await supabase
        .from('tags')
        .select('id')
        .eq('name', tagName)
        .eq('user_id', user.id)
        .single();

      if (tagError && tagError.code !== 'PGRST116') {
        toast.error('Failed to check tag: ' + tagError.message);
        console.error('Tag check error:', tagError);
        continue;
      }

      if (existingTag) {
        tagIds.push(existingTag.id);
      } else {
        const { data: newTag, error: insertError } = await supabase
          .from('tags')
          .insert({ name: tagName, user_id: user.id })
          .select()
          .single();

        if (insertError) {
          toast.error('Failed to add tag: ' + insertError.message);
          console.error('Tag insert error:', insertError);
        } else {
          tagIds.push(newTag.id);
          setAvailableTags(prev => [...prev, newTag]);
        }
      }
    }

    // Step 3: Link tags to prompt
    const promptTagInserts = tagIds.map(tag_id => ({
      prompt_id: promptData.id,
      tag_id,
    }));
    const { error: linkError } = await supabase
      .from('prompt_tags')
      .insert(promptTagInserts);

    if (linkError) {
      toast.error('Failed to link tags: ' + linkError.message);
      console.error('Link tags error:', linkError);
    } else {
      toast.success('Prompt saved successfully!');
      const newPrompt = {
        ...promptData,
        prompt_tags: tagIds.map(tag_id => ({
          tag_id,
          tags: { name: tags[tagIds.indexOf(tag_id)] },
        })),
      };
      setSavedPrompts(prev => [newPrompt, ...prev]);
    }
  };

  const handleTagInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && tagInput.trim()) {
      e.preventDefault();
      const trimmedTag = tagInput.trim();
      if (!tags.includes(trimmedTag)) {
        setTags(prev => [...prev, trimmedTag]);
      }
      setTagInput('');
    }
  };

  const handleTagSelect = (tag: string) => {
    if (!tags.includes(tag)) {
      setTags(prev => [...prev, tag]);
    }
  };

  const handleTagRemove = (tagToRemove: string) => {
    setTags(prev => prev.filter(tag => tag !== tagToRemove));
  };

  const handleSearch = () => {
    const filtered = savedPrompts.filter(prompt =>
      prompt.prompt_tags.some(pt => pt.tags.name.toLowerCase().includes(searchTag.toLowerCase()))
    );
    setSavedPrompts(filtered);
  };

  return (
    <div className="space-y-6">
      <form onSubmit={handleGenerate} className="space-y-4">
        <div>
          <Label htmlFor="role">Role</Label>
          <Select value={role} onValueChange={setRole}>
            <SelectTrigger id="role" className="w-full">
              <SelectValue placeholder="Select a role" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Content Writer">Content Writer</SelectItem>
              <SelectItem value="SEO Specialist">SEO Specialist</SelectItem>
              <SelectItem value="Next.js Developer">Next.js Developer</SelectItem>
              <SelectItem value="Digital Marketing Expert">Digital Marketing Expert</SelectItem>
              <SelectItem value="Pet Travel Expert">Pet Travel Expert</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="task">Task</Label>
          <Select value={task} onValueChange={setTask}>
            <SelectTrigger id="task" className="w-full">
              <SelectValue placeholder="Select a task" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="generate an outline for an article">Generate an outline for an article</SelectItem>
              <SelectItem value="write a section of an article">Write a section of an article</SelectItem>
              <SelectItem value="write a full article to inform">Write a full article to inform</SelectItem>
              <SelectItem value="write a full article to educate">Write a full article to educate</SelectItem>
              <SelectItem value="write a full article to entertain">Write a full article to entertain</SelectItem>
              <SelectItem value="create a list article">Create a list article</SelectItem>
              <SelectItem value="design an infographic">Design an infographic</SelectItem>
              <SelectItem value="write Next.js code">Write Next.js code</SelectItem>
              <SelectItem value="optimize content for SEO">Optimize content for SEO</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="context">Context</Label>
          <Select value={context} onValueChange={setContext}>
            <SelectTrigger id="context" className="w-full">
              <SelectValue placeholder="Select a context" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Wags & Wanders: A site for seamless pet travel for digital nomads and families, offering pet-friendly hotels, airlines, vet networks, and travel planning tools. Keywords: pet travel, pet-friendly hotels, digital nomad pet travel.">
                Wags & Wanders: Pet travel for digital nomads and families
              </SelectItem>
              <SelectItem value="Crashboard: My personal dashboard for managing projects, tasks, and scripts with Next.js and Supabase.">
                Crashboard: Personal project dashboard
              </SelectItem>
              <SelectItem value="Personal Development: Content to improve skills, habits, and self-growth for a general audience.">
                Personal Development: Self-growth content
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="articleDetails">Article Details</Label>
          <Textarea
            id="articleDetails"
            value={articleDetails}
            onChange={(e) => setArticleDetails(e.target.value)}
            placeholder="e.g., Topic: Best pet-friendly hotels in Europe, Audience: Digital nomads with dogs, Key points: Location, amenities, booking tips"
            className="w-full min-h-[100px] dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100"
          />
        </div>

        <div>
          <Label htmlFor="tone">Tone</Label>
          <Select value={tone} onValueChange={setTone}>
            <SelectTrigger id="tone" className="w-full">
              <SelectValue placeholder="Select a tone" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="informative">Informative</SelectItem>
              <SelectItem value="educational">Educational</SelectItem>
              <SelectItem value="entertaining">Entertaining</SelectItem>
              <SelectItem value="casual">Casual</SelectItem>
              <SelectItem value="professional">Professional</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="constraints">Constraints</Label>
          <Select value={constraints} onValueChange={setConstraints}>
            <SelectTrigger id="constraints" className="w-full">
              <SelectValue placeholder="Select constraints" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="under 500 words">Under 500 words</SelectItem>
              <SelectItem value="500-1000 words">500-1000 words</SelectItem>
              <SelectItem value="over 1000 words">Over 1000 words</SelectItem>
              <SelectItem value="use Next.js with TypeScript and Tailwind">Use Next.js with TypeScript and Tailwind</SelectItem>
              <SelectItem value="include SEO keywords: pet travel, pet-friendly hotels">Include SEO keywords: pet travel, pet-friendly hotels</SelectItem>
              <SelectItem value="limit to 3 sections">Limit to 3 sections</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="output">Output Format</Label>
          <Select value={output} onValueChange={setOutput}>
            <SelectTrigger id="output" className="w-full">
              <SelectValue placeholder="Select an output format" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="markdown">Markdown</SelectItem>
              <SelectItem value="plain text">Plain text</SelectItem>
              <SelectItem value="Next.js component (.tsx)">Next.js component (.tsx)</SelectItem>
              <SelectItem value="HTML">HTML</SelectItem>
              <SelectItem value="numbered list">Numbered list</SelectItem>
              <SelectItem value="bullet list">Bullet list</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label>Tags</Label>
          <div className="space-y-2">
            <input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={handleTagInputKeyDown}
              placeholder="Type a tag and press Enter"
              className="w-full p-2 border rounded-md dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100"
            />
            <div className="flex flex-wrap gap-2">
              {tags.map(tag => (
                <span
                  key={tag}
                  className="inline-flex items-center px-2 py-1 rounded-full text-sm bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                >
                  {tag}
                  <button
                    onClick={() => handleTagRemove(tag)}
                    className="ml-1 text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            {availableTags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {availableTags
                  .filter(tag => !tags.includes(tag.name))
                  .map(tag => (
                    <button
                      key={tag.id}
                      onClick={() => handleTagSelect(tag.name)}
                      className="px-2 py-1 rounded-full text-sm bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600"
                    >
                      {tag.name}
                    </button>
                  ))}
              </div>
            )}
          </div>
        </div>

        <Button type="submit" className="w-full sm:w-auto">Generate Prompt</Button>
      </form>

      {generatedPrompt && (
        <div className="mt-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Generated Prompt:</h3>
          <pre className="bg-gray-100 dark:bg-gray-800 p-4 rounded whitespace-pre-wrap text-sm text-gray-800 dark:text-gray-200">{generatedPrompt}</pre>
          <div className="mt-2 space-x-2">
            <Button onClick={handleRefine}>Refine with AI</Button>
            <Button onClick={handleSave} variant="secondary">Save Prompt</Button>
          </div>
        </div>
      )}

      {refinedPrompt && (
        <div className="mt-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Refined Prompt:</h3>
          <pre className="bg-gray-100 dark:bg-gray-800 p-4 rounded whitespace-pre-wrap text-sm text-gray-800 dark:text-gray-200">{refinedPrompt}</pre>
          <Button onClick={handleSave} className="mt-2" variant="secondary">Save Refined Prompt</Button>
        </div>
      )}

      <div className="mt-8">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Saved Prompts</h3>
        <div className="flex flex-col sm:flex-row gap-2 mb-4">
          <input
            value={searchTag}
            onChange={(e) => setSearchTag(e.target.value)}
            placeholder="Search by tag"
            className="w-full sm:w-64 p-2 border rounded-md dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100"
          />
          <Button onClick={handleSearch} className="w-full sm:w-auto">Search</Button>
          <Button onClick={fetchSavedPrompts} variant="outline" className="w-full sm:w-auto">Refresh</Button>
        </div>
        <div className="space-y-4">
          {savedPrompts.map(prompt => (
            <div key={prompt.id} className="p-4 border rounded-lg bg-white dark:bg-gray-900">
              <p className="whitespace-pre-wrap text-sm text-gray-800 dark:text-gray-200">{prompt.prompt_text}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Tags: {prompt.prompt_tags.map(pt => pt.tags.name).join(', ')}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Saved: {new Date(prompt.created_at).toLocaleString()}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}