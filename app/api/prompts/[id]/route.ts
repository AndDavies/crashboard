import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// DELETE /api/prompts/[id] - Delete a specific prompt
export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  const cookieStore = await cookies(); // Await cookies() first

  // Create Supabase client with resolved cookie handlers
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options });
          } catch (error) {
             console.log(`Note: Failed to set cookie '${name}' in Route Handler.`);
          }
        },
        remove(name: string, options: CookieOptions) {
           try {
             cookieStore.set({ name, value: '', ...options }); 
           } catch (error) {
              console.log(`Note: Failed to remove cookie '${name}' in Route Handler.`);
           }
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const promptId = params.id;

  if (!promptId || isNaN(parseInt(promptId))) {
      return NextResponse.json({ error: 'Invalid prompt ID' }, { status: 400 });
  }

  const { error } = await supabase
    .from('prompts')
    .delete()
    .eq('id', parseInt(promptId))
    .eq('user_id', user.id); // Ensure user can only delete their own prompts

  if (error) {
    console.error('Error deleting prompt:', error);
    // Handle potential row-not-found error gracefully (e.g., if already deleted)
    if (error.code === 'PGRST116') { 
      return NextResponse.json({ message: 'Prompt not found or already deleted' }, { status: 404 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ message: 'Prompt deleted successfully' });
} 