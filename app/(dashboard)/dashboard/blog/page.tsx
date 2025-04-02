import Link from 'next/link';
import { supabaseBlog } from '@/utils/supabase/supabaseBlogClient';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calendar } from 'lucide-react';
import { format } from 'date-fns';
import Image from 'next/image';

interface BlogPost {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  published_at: string | null;
  featured_image?: string | null;
  tags?: string[] | null;
  is_featured?: boolean | null;
}

export default async function BlogPage() {
  const { data: posts, error } = await supabaseBlog
    .from('blog_posts')
    .select('id, title, slug, excerpt, published_at, featured_image, tags, is_featured')
    .order('created_at', { ascending: false })
    .limit(9); // Match your production limit

  if (error) {
    return <div className="w-full p-8">Error loading posts: {error.message}</div>;
  }

  return (
    <div className="w-full p-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold text-[#249ab4]">Blog Posts</h1>
        <Link href="/dashboard/blog/create" className="text-blue-500 underline">
          Create New Post
        </Link>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {posts?.map((post: BlogPost) => (
          <Card
            key={post.id}
            className="overflow-hidden hover:shadow-lg transition-all duration-300 border border-gray-100 h-full flex flex-col bg-white"
          >
            {post.featured_image && (
              <div className="relative h-48 overflow-hidden">
                <Image
                  src={post.featured_image || "/placeholder.svg"}
                  alt={post.title}
                  fill
                  className="object-cover transition-transform duration-500 hover:scale-105"
                />
                {post.tags && post.tags.length > 0 && (
                  <div className="absolute top-3 left-3">
                    <Badge className="bg-white/80 backdrop-blur-sm text-[#249ab4]">{post.tags[0]}</Badge>
                  </div>
                )}
              </div>
            )}
            <CardContent className="p-6 flex-grow">
              <div className="flex items-center gap-4 text-xs text-[#493f40]/70 mb-3">
                <div className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  <span>{post.published_at ? format(new Date(post.published_at), "MMM d, yyyy") : "N/A"}</span>
                </div>
              </div>
              <h3 className="text-xl font-bold mb-3 text-[#249ab4] line-clamp-2">{post.title}</h3>
              <p className="text-[#493f40]/80 text-sm line-clamp-3 mb-4">{post.excerpt || "No excerpt available"}</p>
            </CardContent>
            <CardFooter className="px-6 pb-6 pt-0">
              <Button
                asChild
                variant="outline"
                className="text-[#249ab4] border-[#249ab4] hover:bg-[#FFA9DE]/10 hover:text-[#249ab4] w-full"
              >
                <Link href={`/dashboard/blog/edit/${post.id}`}>Edit</Link>
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>
    </div>
  );
}