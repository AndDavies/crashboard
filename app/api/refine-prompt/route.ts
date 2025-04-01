import { OpenAI } from 'openai';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const { prompt }: { prompt: string } = await req.json();
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: 'You are an expert prompt engineer. Refine the following prompt to make it clearer, more concise, and optimized for an AI assistant, while preserving its original intent.',
        },
        { role: 'user', content: prompt },
      ],
    });

    const refined = response.choices[0].message.content;
    return NextResponse.json({ refined }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}