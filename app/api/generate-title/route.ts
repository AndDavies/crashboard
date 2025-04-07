// app/api/generate-title/route.ts
import { NextResponse } from 'next/server';
import { OpenAI } from 'openai';

// Initialize OpenAI client on the server side
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, // No NEXT_PUBLIC_ prefix, as this is server-side
});

export async function POST(request: Request) {
  try {
    const { content } = await request.json();

    if (!content || typeof content !== 'string') {
      return NextResponse.json({ error: 'Content is required and must be a string' }, { status: 400 });
    }

    const prompt = content.startsWith('http')
      ? `Fetch the title of the webpage at this URL: ${content}`
      : `Summarize the following content into a short reminder title (max 5 words): ${content}`;

    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 10,
    });

    const title = response.choices[0]?.message.content?.trim() || 'Generated Title';
    return NextResponse.json({ title });
  } catch (error) {
    console.error('Error generating title with OpenAI:', error);
    return NextResponse.json({ error: 'Failed to generate title' }, { status: 500 });
  }
}