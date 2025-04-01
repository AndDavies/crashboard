import { NextResponse } from 'next/server';
import { randomBytes, createHash } from 'crypto';

export async function GET() {
  const clientId = process.env.TWITTER_CLIENT_ID!;
  const redirectUri = 'http://localhost:3000/api/twitter/callback'; // Update for production
  const state = randomBytes(16).toString('hex');
  const codeVerifier = randomBytes(32).toString('base64url');
  const codeChallenge = createHash('sha256')
    .update(codeVerifier)
    .digest('base64url');

  const authUrl = `https://twitter.com/i/oauth2/authorize?response_type=code&client_id=${clientId}&redirect_uri=${redirectUri}&scope=tweet.read%20users.read%20bookmark.read&state=${state}&code_challenge=${codeChallenge}&code_challenge_method=S256`;

  const response = NextResponse.redirect(authUrl);
  response.cookies.set('twitter_code_verifier', codeVerifier, { httpOnly: true, path: '/' });
  response.cookies.set('twitter_state', state, { httpOnly: true, path: '/' });

  return response;
}