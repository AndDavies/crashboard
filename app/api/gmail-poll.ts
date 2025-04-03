import type { NextApiRequest, NextApiResponse } from "next";
import { checkEmailsForUser } from "../../lib/gmail-to-supabase"; // Update to new function name

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Replace with your and Ashley's Supabase user IDs
    const userIds = [
      "de352401-7876-41de-b2c5-dd185d136bf4", // Your user_id (example from Twitter table)
      "<ashley-supabase-user-id>", // Replace with Ashley's actual user_id
    ];
    await Promise.all(userIds.map((userId) => checkEmailsForUser(userId)));
    res.status(200).json({ message: "Polled Gmail for both users" });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
}