import { OpenAI } from 'openai';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const { content, url }: { content?: string; url?: string } = await req.json();
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  // Handle case where neither content nor URL is provided
  if (!content && !url) {
    return NextResponse.json({ error: "Either content or URL is required" }, { status: 400 });
  }

  try {
    let titleSource = content;
    let metadata = "";

    // If a URL is provided, fetch its content
    if (url && /^https?:\/\//.test(url)) {
      try {
        const response = await fetch(url);
        const html = await response.text();
        
        // Extract metadata from the page
        const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i);
        const ogTitleMatch = html.match(/<meta[^>]*property="og:title"[^>]*content="([^"]*)"[^>]*>/i);
        const descriptionMatch = html.match(/<meta[^>]*name="description"[^>]*content="([^"]*)"[^>]*>/i);
        const ogDescriptionMatch = html.match(/<meta[^>]*property="og:description"[^>]*content="([^"]*)"[^>]*>/i);
        
        const extractedTitle = ogTitleMatch?.[1] || titleMatch?.[1] || "";
        const extractedDescription = ogDescriptionMatch?.[1] || descriptionMatch?.[1] || "";
        
        // Use the extracted data as a source for title generation
        metadata = `URL Title: ${extractedTitle}\nURL Description: ${extractedDescription}\n`;
        titleSource = `${metadata}${content || ""}`;
      } catch (error) {
        console.error("URL fetch error:", error);
        // Continue with just the content if URL fetch fails
      }
    }

    // Generate title using OpenAI
    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: 'You are an expert at creating concise, descriptive titles. Generate a short, clear title that captures the essence of the content provided. The title should be 2-7 words long and accurately reflect the main point or purpose of the content.',
        },
        { 
          role: 'user', 
          content: `Create a concise title for the following content:\n\n${titleSource}` 
        },
      ],
      max_tokens: 50,
      temperature: 0.7,
    });

    const generatedTitle = response.choices[0].message.content?.trim() || "Untitled";
    return NextResponse.json({ title: generatedTitle });
  } catch (error) {
    console.error("Title generation error:", error);
    return NextResponse.json({ title: "Untitled", error: (error as Error).message }, { status: 500 });
  }
} 