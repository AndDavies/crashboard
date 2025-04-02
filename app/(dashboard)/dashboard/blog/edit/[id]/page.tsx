import { supabaseBlog } from '@/utils/supabase/supabaseBlogClient';
import BlogEditor, { BlogPost } from '@/components/BlogEditor';
import { redirect } from 'next/navigation';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditPage({ params }: PageProps) {
  const { id } = await params;
  const { data, error } = await supabaseBlog.from('blog_posts').select('*').eq('id', id).single();

  if (error || !data) {
    redirect('/dashboard/blog');
  }

  const post = data as BlogPost;

  return (
    <div className="w-full p-8">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-3xl font-bold">Edit Post</h1>
        <Button variant="outline" asChild>
          <Link href="/dashboard/blog">Back to Blog</Link>
        </Button>
      </div>
      <BlogEditor initialData={post} />
    </div>
  );
}