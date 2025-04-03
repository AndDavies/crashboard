import { google } from "googleapis";
const credentials = {
    web: {
        client_id: "1037339505580-8cveo6nbjo7mfmi9ahgqbhlti7atqc62.apps.googleusercontent.com",
        client_secret: "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",
        redirect_uris: ["https://findyourchimps.dev/auth/callback"],
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
    console.log(`Authorize ${email} by visiting:`, authUrl);
    console.log("Paste the code here after authorizing:");
}
getToken("m.andrew.davies@gmail.com").catch(console.error);
