import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const storedState = request.cookies.get('twitter_state')?.value;
  const codeVerifier = request.cookies.get('twitter_code_verifier')?.value;

  if (!code || !state || state !== storedState || !codeVerifier) {
    return NextResponse.json({ error: 'Invalid OAuth state or code' }, { status: 400 });
  }

  const clientId = process.env.TWITTER_CLIENT_ID!;
  const clientSecret = process.env.TWITTER_CLIENT_SECRET!;
  const redirectUri = 'http://localhost:3000/api/twitter/callback';

  const response = await fetch('https://api.twitter.com/2/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    return NextResponse.json({ error: data.error_description || 'Failed to get token' }, { status: 400 });
  }

  const nextResponse = NextResponse.redirect('/dashboard/bookmarks');
  nextResponse.cookies.set('twitter_access_token', data.access_token, { httpOnly: true, path: '/', maxAge: 3600 }); // 1 hour expiry
  return nextResponse;
}