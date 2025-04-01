import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/utils/supabase/server';

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
  const redirectUri = process.env.TWITTER_REDIRECT_URI!;

  try {
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

    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'User not authenticated' }, { status: 401 });
    }

    await supabase
      .from('user_tokens')
      .upsert({ user_id: user.id, twitter_access_token: data.access_token }, { onConflict: 'user_id' });

    // Use absolute URL based on request host
    const host = request.headers.get('host') || 'localhost:3000';
    const protocol = host.includes('localhost') ? 'http' : 'https';
    const absoluteUrl = `${protocol}://${host}/dashboard/bookmarks`;

    const nextResponse = NextResponse.redirect(absoluteUrl);
    nextResponse.cookies.delete('twitter_code_verifier');
    nextResponse.cookies.delete('twitter_state');
    return nextResponse;
  } catch (error) {
    console.error('Callback error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}