import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

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
  const redirectUri = process.env.TWITTER_REDIRECT_URI || 'https://findyourchimps.dev/api/twitter/callback';

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

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    await supabase.from('user_tokens').upsert({
      user_id: user.id,
      twitter_access_token: data.access_token,
    });
  }

  const nextResponse = NextResponse.redirect('/dashboard/bookmarks');
  nextResponse.cookies.set('twitter_access_token', data.access_token, { httpOnly: true, path: '/', maxAge: 3600 });
  return nextResponse;
}