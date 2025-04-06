import { NextResponse } from "next/server";
import OpenAI from "openai";

export async function POST(req: Request) {
  console.log("[API] /api/generate/openai called");

  try {
    const { task, code } = await req.json();
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return NextResponse.json({ error: "Missing OpenAI API key." }, { status: 500 });
    }

    const openai = new OpenAI({ apiKey });

    const input = `${task}\n\n${code ? `\n\nCode:\n\n${code}` : ""}`;

    const response = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: `You are a senior software engineer who converts vague bug reports or tasks into clear, structured, role-based prompts for AI-powered developer tools like Cursor. Your output includes context, task, detail, and goal sections.`,
        },
        {
          role: "user",
          content: input,
        },
      ],
    });

    return NextResponse.json({ result: response.choices[0].message.content });
  } catch (err: any) {
    console.error("OpenAI API error:", err);
    return NextResponse.json({ error: "Failed to generate prompt." }, { status: 500 });
  }
}
