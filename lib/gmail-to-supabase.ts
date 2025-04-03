import { google, gmail_v1 } from "googleapis";
import { OAuth2Client } from "google-auth-library";
import axios from "axios";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const GOOGLE_CREDENTIALS = JSON.parse(process.env.GOOGLE_CREDENTIALS!);
const { client_id, client_secret, redirect_uris } = GOOGLE_CREDENTIALS.web;

interface Reminder {
  title: string;
  content: string;
  user_id: string;
  need_to_do: boolean;
  want_to_do: boolean;
  energy_scale: number | null;
  color: string;
  is_archived: boolean;
  is_done: boolean;
}

async function authorize(token: string): Promise<OAuth2Client> {
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[1]);
  oAuth2Client.setCredentials({ access_token: token });
  return oAuth2Client;
}

async function getUserToken(userId: string): Promise<{ user_id: string; token: string }> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data, error } = await supabase
    .from("gmail_tokens")
    .select("user_id, gmail_access_token")
    .eq("user_id", userId)
    .single();

  if (error) {
    console.error("Supabase error fetching token:", error);
    throw new Error(`Error fetching token for user ${userId}: ${error.message}`);
  }
  if (!data) throw new Error(`No token found for user ${userId}`);

  return { user_id: data.user_id, token: data.gmail_access_token };
}

export async function checkEmailsForUser(userId: string) {
  try {
    const { user_id, token } = await getUserToken(userId);
    const authClient = await authorize(token);
    const gmail = google.gmail({ version: "v1", auth: authClient });

    console.log(`Checking emails for user ${user_id}...`);

    const res = await gmail.users.messages.list({
      userId: "me",
      q: "from:me to:me",
      maxResults: 10,
    });

    const messages = res.data.messages || [];
    console.log(`Found ${messages.length} potential reminder emails.`);

    if (!messages.length) {
      console.log("No messages found matching the criteria.");
      return;
    }

    for (const message of messages) {
      if (!message.id) continue;

      console.log(`Processing message ID: ${message.id}`);
      const emailData = await gmail.users.messages.get({ userId: "me", id: message.id, format: "full" });

      const payload = emailData.data.payload;
      if (!payload) continue;

      const headers = payload.headers || [];
      const subjectHeader = headers.find((h: gmail_v1.Schema$MessagePartHeader) => h.name?.toLowerCase() === "subject");
      const subject = subjectHeader?.value || "Untitled";

      let body = "";
      if (payload.parts) {
        const textPart = payload.parts.find((part) => part.mimeType === "text/plain");
        if (textPart?.body?.data) {
          body = Buffer.from(textPart.body.data, "base64").toString("utf-8");
        } else if (payload.body?.data) {
          body = Buffer.from(payload.body.data, "base64").toString("utf-8");
        }
      } else if (payload.body?.data) {
        body = Buffer.from(payload.body.data, "base64").toString("utf-8");
      }

      if (!body) {
        console.warn(`Could not extract body for message ${message.id}`);
        continue;
      }

      const reminder: Reminder = {
        title: subject,
        content: body,
        user_id,
        need_to_do: body.includes("#need"),
        want_to_do: body.includes("#want"),
        energy_scale: body.match(/#energy(\d)/)?.[1] ? parseInt(body.match(/#energy(\d)/)![1]) : null,
        color: body.match(/#color(\w+)/)?.[1] ? `soft-${body.match(/#color(\w+)/)![1].toLowerCase()}` : "soft-gray",
        is_archived: false,
        is_done: false,
      };

      console.log("Created reminder object:", reminder.title);

      const postUrl = `${SUPABASE_URL}/rest/v1/reminders`;
      await axios.post(postUrl, reminder, {
        headers: {
          "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
          "apikey": `${SUPABASE_ANON_KEY}`,
          "Content-Type": "application/json",
          "Prefer": "return=minimal",
        },
      });
      console.log(`Successfully posted reminder "${reminder.title}" to Supabase.`);
    }
  } catch (error) {
    console.error("Error in checkEmailsForUser:", error);
  }
}