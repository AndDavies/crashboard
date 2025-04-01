import { NextResponse } from 'next/server';
import { randomBytes, createHash } from 'crypto';

export async function GET() {
  const clientId = process.env.TWITTER_CLIENT_ID!;
  const redirectUri = process.env.TWITTER_REDIRECT_URI!;
  const state = randomBytes(16).toString('hex');
  const codeVerifier = randomBytes(32).toString('base64url');
  const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');

  const authUrl = new URL('https://twitter.com/i/oauth2/authorize');
  authUrl.searchParams.append('response_type', 'code');
  authUrl.searchParams.append('client_id', clientId);
  authUrl.searchParams.append('redirect_uri', redirectUri);
  authUrl.searchParams.append('scope', 'tweet.read users.read bookmark.read');
  authUrl.searchParams.append('state', state);
  authUrl.searchParams.append('code_challenge', codeChallenge);
  authUrl.searchParams.append('code_challenge_method', 'S256');

  const response = NextResponse.redirect(authUrl.toString());
  response.cookies.set('twitter_code_verifier', codeVerifier, { httpOnly: true, path: '/', maxAge: 600 });
  response.cookies.set('twitter_state', state, { httpOnly: true, path: '/', maxAge: 600 });

  return response;
}