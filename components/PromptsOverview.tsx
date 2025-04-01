import { createClient } from '@/utils/supabase/server';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import Link from 'next/link';

interface Prompt {
  id: string;
  prompt_text: string;
  tags: string[];
  created_at: string;
}

interface PromptsOverviewProps {
  userId: string;
}

export async function PromptsOverview({ userId }: PromptsOverviewProps) {
  const supabase = await createClient();
  const { data: prompts, error } = await supabase
    .from('prompts')
    .select('id, prompt_text, tags, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(3);

  if (error) {
    return <div className="text-red-500 dark:text-red-400">Error loading prompts: {error.message}</div>;
  }

  return (
    <Card className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700">
      <CardHeader>
        <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white">Recent Prompts</CardTitle>
      </CardHeader>
      <CardContent>
        {prompts.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">No prompts saved yet.</p>
        ) : (
          <div className="space-y-4">
            {prompts.map((prompt: Prompt) => (
              <div key={prompt.id}>
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{prompt.prompt_text}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Tags: {prompt.tags.join(', ')}</p>
              </div>
            ))}
            <Link href="/dashboard/prompts" className="text-sm text-blue-500 hover:underline dark:text-blue-400">
              View all prompts
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}