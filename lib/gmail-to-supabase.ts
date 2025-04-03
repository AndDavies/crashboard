import { google, gmail_v1 } from "googleapis"; // Remove 'auth' from here
import { OAuth2Client } from "google-auth-library"; // Import the type directly for clarity
import axios from "axios";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
// IMPORTANT SECURITY NOTE: Exposing GOOGLE_CREDENTIALS (especially client_secret)
// via NEXT_PUBLIC_ variables is a major security risk if this code
// ever runs client-side or if the env var is exposed unintentionally.
// Ensure this runs strictly server-side and consider safer secret management.
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

// Removed unused 'email' parameter
async function authorize(token: string): Promise<OAuth2Client> { // Use the imported type
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[1]);
  oAuth2Client.setCredentials({ access_token: token });
  return oAuth2Client;
}

// Removed unused 'email' parameter, improved error message
async function getUserToken(userId: string): Promise<{ user_id: string; token: string }> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data, error } = await supabase
    .from("gmail_tokens")
    .select("user_id, gmail_access_token")
    .eq("user_id", userId) // Query using the provided userId
    .single(); // Use .single() if you expect exactly one row for the user

  // More specific error handling
  if (error) {
      console.error("Supabase error fetching token:", error);
      throw new Error(`Error fetching token for user ${userId}: ${error.message}`);
  }
  if (!data) {
      throw new Error(`No token found for user ${userId}`);
  }

  return { user_id: data.user_id, token: data.gmail_access_token };
}

// Added explicit parameter for the user ID
export async function checkEmailsForUser(userId: string) {
  try {
    const { user_id, token } = await getUserToken(userId); // Pass userId
    const authClient = await authorize(token); // Pass only the token, rename variable
    const gmail = google.gmail({ version: "v1", auth: authClient }); // Pass the authorized client correctly

    console.log(`Checking emails for user ${user_id}...`);

    const res = await gmail.users.messages.list({
      userId: "me",
      q: "from:me to:me", // Optional: add 'subject:reminder' or similar for more specific filtering
      maxResults: 10, // Limit results directly in the API call if possible
    });

    const messages = res.data.messages || [];
    console.log(`Found ${messages.length} potential reminder emails.`);

    if (!messages.length) {
      console.log("No messages found matching the criteria.");
      return;
    }

    // Consider processing in parallel if many messages (Promise.all)
    for (const message of messages) { // No need to slice if maxResults is used
      if (!message.id) continue;

      console.log(`Processing message ID: ${message.id}`);
      const emailData = await gmail.users.messages.get({ userId: "me", id: message.id, format: "full" }); // format: 'full' or 'metadata' might be sufficient?

      const payload = emailData.data.payload;
      if (!payload) continue;

      const headers = payload.headers || [];
      const subjectHeader = headers.find((h: gmail_v1.Schema$MessagePartHeader) => h.name?.toLowerCase() === "subject");
      const subject = subjectHeader?.value || "Untitled";

      let body = "";
      // Find the plain text part - adjust if you prefer HTML or need more complex parsing
      if (payload.parts) {
          const textPart = payload.parts.find(part => part.mimeType === 'text/plain');
          if (textPart?.body?.data) {
              body = Buffer.from(textPart.body.data, 'base64').toString('utf-8');
          } else {
             // Fallback or look for HTML part if needed
             console.warn(`No text/plain part found for message ${message.id}`);
             // Optional: attempt to decode main body if no parts or text/plain not found
             if (payload.body?.data) {
                body = Buffer.from(payload.body.data, 'base64').toString('utf-8');
             }
          }
      } else if (payload.body?.data) {
           body = Buffer.from(payload.body.data, 'base64').toString('utf-8');
      }

      if (!body) {
          console.warn(`Could not extract body for message ${message.id}`);
          continue; // Skip if body is empty
      }

      const needTag = body.includes("#need");
      const wantTag = body.includes("#want");
      const energyMatch = body.match(/#energy(\d)/);
      const colorMatch = body.match(/#color(\w+)/);

      const reminder: Reminder = {
        title: subject,
        content: body, // Store the raw body or perhaps a cleaned version?
        user_id,
        need_to_do: needTag,
        want_to_do: wantTag,
        energy_scale: energyMatch?.[1] ? parseInt(energyMatch[1]) : null,
        color: colorMatch?.[1] ? `soft-${colorMatch[1].toLowerCase()}` : "soft-gray",
        is_archived: false, // Should these be determined by tags too?
        is_done: false,
      };

      console.log("Created reminder object:", reminder.title);

      // *** IMPORTANT: Correct the Supabase URL ***
      // Replace 'your_table_name' with the actual table you want to insert into
      const postUrl = `${SUPABASE_URL}/rest/v1/reminders`; // Example: Using PostgREST endpoint

      await axios.post(postUrl, reminder, {
        headers: {
          "Authorization": `Bearer ${SUPABASE_ANON_KEY}`, // Use the ANON key for RLS
          "apikey": `${SUPABASE_ANON_KEY}`, // API key header
          "Content-Type": "application/json",
          "Prefer": "return=minimal" // Optional: avoid returning the inserted data
        },
      });
      console.log(`Successfully posted reminder "${reminder.title}" to Supabase.`);

      // Optional: Archive or mark the email as read after processing
      // await gmail.users.messages.modify({ userId: 'me', id: message.id, requestBody: { removeLabelIds: ['UNREAD'] } });
      // await gmail.users.messages.modify({ userId: 'me', id: message.id, requestBody: { addLabelIds: ['processed_label_id'] } }); // Needs a label ID
    }
  } catch (error) {
    // Log the error for debugging
    console.error("Error in checkEmailsForUser:", error);
    // Depending on the context, you might want to re-throw or handle differently
  }
}

// Example usage (assuming you get the user ID from somewhere):
// const currentUserId = (await supabase.auth.getUser()).data.user?.id;
// if (currentUserId) {
//   checkEmailsForUser(currentUserId);
// }