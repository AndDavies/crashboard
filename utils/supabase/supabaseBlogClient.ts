import { createClient } from '@supabase/supabase-js';

export const supabaseBlog = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_BLOG_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_BLOG_ANON_KEY!
);