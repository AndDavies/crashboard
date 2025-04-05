import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import OpenAI from 'openai';

export const dynamic = 'force-dynamic';

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    
    // Create Supabase client to verify user
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

    // Verify user is authenticated
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get request body
    const { context, type, seed } = await request.json();

    if (!context || !type) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Determine if seed is a number or word
    const isNumberSeed = !isNaN(Number(seed));
    
    // Construct the system prompt based on the type and seed
    let systemPrompt = '';
    switch (type) {
      case 'coding':
        systemPrompt = `You are an expert software engineer and prompt engineer. Generate a detailed prompt that will help an AI assistant write high-quality code. The context is: ${context}.`;
        break;
      case 'writing':
        systemPrompt = `You are an expert writer and editor. Generate a detailed prompt that will help an AI assistant create engaging and well-structured content. The context is: ${context}.`;
        break;
      case 'analysis':
        systemPrompt = `You are an expert data analyst. Generate a detailed prompt that will help an AI assistant perform thorough data analysis. The context is: ${context}.`;
        break;
      case 'research':
        systemPrompt = `You are an expert researcher. Generate a detailed prompt that will help an AI assistant conduct comprehensive research. The context is: ${context}.`;
        break;
      default:
        systemPrompt = `Generate a detailed and effective prompt for an AI assistant based on the following context: ${context}.`;
    }

    // Add seed handling
    if (seed) {
      if (isNumberSeed) {
        systemPrompt += `\n\nUse seed number ${seed} to generate a consistent but unique variation of this prompt. This will help you get similar but not identical results when you need to try different approaches to the same task.`;
      } else {
        systemPrompt += `\n\nFocus the prompt on the topic of "${seed}". This will help you get more specific and relevant results for your particular area of interest.`;
      }
    }

    // Generate the prompt using OpenAI
    const completion = await openai.chat.completions.create({
      model: "gpt-4-turbo-preview",
      messages: [
        {
          role: "system",
          content: systemPrompt
        },
        {
          role: "user",
          content: "Generate a detailed, effective prompt that will help an AI assistant achieve the best possible results. Make sure the prompt is clear, specific, and includes any necessary context or constraints."
        }
      ],
      temperature: 0.7,
      max_tokens: 1000,
    });

    const generatedPrompt = completion.choices[0]?.message?.content;

    if (!generatedPrompt) {
      return NextResponse.json({ error: 'Failed to generate prompt' }, { status: 500 });
    }

    return NextResponse.json({ prompt: generatedPrompt });
  } catch (error) {
    console.error('Error generating prompt:', error);
    return NextResponse.json(
      { error: 'An error occurred while generating the prompt' },
      { status: 500 }
    );
  }
} 