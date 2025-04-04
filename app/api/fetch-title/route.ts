import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/utils/supabase/server";
import { OpenAI } from 'openai';

export async function POST(request: Request) {
  const { url } = await request.json();

  if (!url || !/^https?:\/\//.test(url)) {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  try {
    // Fetch the URL content
    const response = await fetch(url);
    const html = await response.text();
    
    // Extract basic metadata
    const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i);
    const ogTitleMatch = html.match(/<meta[^>]*property="og:title"[^>]*content="([^"]*)"[^>]*>/i);
    const descriptionMatch = html.match(/<meta[^>]*name="description"[^>]*content="([^"]*)"[^>]*>/i);
    const ogDescriptionMatch = html.match(/<meta[^>]*property="og:description"[^>]*content="([^"]*)"[^>]*>/i);
    
    // Extract page content (simplistic approach - gets text from body)
    let pageContent = "";
    const bodyContent = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    if (bodyContent && bodyContent[1]) {
      // Strip HTML tags and get text content
      pageContent = bodyContent[1]
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
        .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .substring(0, 1000); // Limit content size
    }
    
    // Create extracted data
    const extractedTitle = ogTitleMatch?.[1] || titleMatch?.[1] || "";
    const extractedDescription = ogDescriptionMatch?.[1] || descriptionMatch?.[1] || "";
    
    // If we have an OpenAI API key, try to generate a better title using the extracted content
    try {
      if (process.env.OPENAI_API_KEY && (extractedTitle || extractedDescription || pageContent)) {
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        
        const contentSummary = `
          URL: ${url}
          Title: ${extractedTitle}
          Description: ${extractedDescription}
          Content: ${pageContent}
        `;
        
        const aiResponse = await openai.chat.completions.create({
          model: 'gpt-3.5-turbo',
          messages: [
            {
              role: 'system',
              content: 'You are an expert at creating concise, descriptive titles. Generate a short, clear title that captures the essence of this web page. The title should be 2-7 words and accurately reflect the main point or purpose.',
            },
            { 
              role: 'user', 
              content: `Create a concise title for this web page:\n\n${contentSummary}` 
            },
          ],
          max_tokens: 50,
          temperature: 0.7,
        });
        
        const generatedTitle = aiResponse.choices[0].message.content?.trim();
        if (generatedTitle) {
          return NextResponse.json({ 
            title: generatedTitle,
            originalTitle: extractedTitle,
            description: extractedDescription
          });
        }
      }
    } catch (aiError) {
      console.error("AI title generation error:", aiError);
      // Fall back to basic extraction if AI fails
    }
    
    // Fallback to basic extraction
    return NextResponse.json({ 
      title: extractedTitle || "Untitled",
      description: extractedDescription
    });
  } catch (error) {
    console.error("Fetch error:", error);
    return NextResponse.json({ title: "Untitled" });
  }
}