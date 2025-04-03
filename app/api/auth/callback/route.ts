import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");

  if (!code) {
    return new NextResponse("No code provided in the callback.", { status: 400 });
  }

  const html = `
    <h1>Authorization Code</h1>
    <p>Please copy this code and paste it into your terminal:</p>
    <pre>${code}</pre>
  `;
  return new NextResponse(html, {
    status: 200,
    headers: { "Content-Type": "text/html" },
  });
}