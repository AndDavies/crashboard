import { NextRequest, NextResponse } from "next/server";
import { checkEmailsForUser } from "../../../lib/gmail-to-supabase"; // Adjusted path for app/api/

export async function GET(req: NextRequest) {
  try {
    const userIds = [
      "de352401-7876-41de-b2c5-dd185d136bf4", // Your user_id
      "<ashley-supabase-user-id>", // Replace with Ashley's user_id after token generation
    ];
    await Promise.all(userIds.map((userId) => checkEmailsForUser(userId)));
    return NextResponse.json({ message: "Polled Gmail for both users" }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}