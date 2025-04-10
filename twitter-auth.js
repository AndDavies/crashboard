const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env.local') });

const crypto = require('crypto');

const clientId = process.env.TWITTER_CLIENT_ID; // Skx3WTk2LWpOUmRRNnJSYmdvNTk6MTpjaQ
const clientSecret = process.env.TWITTER_CLIENT_SECRET; // P2MADTpG4HmI6ExBIkZxM2ToNCK79lN7VSxTi5qd4fXJHin0_E
const redirectUri = process.env.TWITTER_REDIRECT_URI; // https://findyourchimps.dev/api/twitter/callback

console.log('TWITTER_CLIENT_ID:', clientId);
console.log('TWITTER_CLIENT_SECRET:', clientSecret);
console.log('TWITTER_REDIRECT_URI:', redirectUri);

if (!clientId || !clientSecret || !redirectUri) {
  console.error('Error: One or more environment variables are missing. Check .env.local.');
  process.exit(1);
}

const codeVerifier = crypto.randomBytes(32).toString('base64url');
const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');

console.log('1. Open this URL in your browser:');
const authUrl = `https://twitter.com/i/oauth2/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=tweet.read%20users.read%20bookmark.read&state=manual&code_challenge=${codeChallenge}&code_challenge_method=S256`;
console.log(authUrl);
console.log('2. After authorizing, you’ll be redirected. Copy the "code" from the URL (e.g., https://findyourchimps.dev/api/twitter/callback?code=ABC123...).');

async function getAccessToken(code) {
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
    console.error('Error:', data);
    return;
  }
  console.log('Access Token:', data.access_token);
  console.log('Refresh Token:', data.refresh_token);
  console.log('Expires In:', data.expires_in);
}

getAccessToken('YOUR_CODE_HERE');