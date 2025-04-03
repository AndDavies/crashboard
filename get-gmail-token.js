const { google } = require("googleapis");
const readline = require("readline");
const fs = require("fs").promises;

const credentials = {
  web: {
    client_id: "1037339505580-8cveo6nbjo7mfmi9ahgqbhlti7atqc62.apps.googleusercontent.com",
    client_secret: "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",
    redirect_uris: ["https://findyourchimps.dev/api/auth/callback"], // Production URI
  },
};
const { client_id, client_secret, redirect_uris } = credentials.web;
const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

async function getToken(email) {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: "offline",
    scope: ["https://www.googleapis.com/auth/gmail.readonly"],
    login_hint: email,
  });
  console.log(`Authorize ${email} by visiting this URL:`, authUrl);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const code = await new Promise((resolve) =>
    rl.question("Enter the code from the callback page here: ", resolve)
  );
  rl.close();

  const { tokens } = await oAuth2Client.getToken(code);
  await fs.writeFile(`${email}-token.json`, JSON.stringify(tokens));
  console.log(`Token stored to ${email}-token.json`);
  console.log("Access Token:", tokens.access_token);
}

getToken("m.andrew.davies@gmail.com").catch(console.error);