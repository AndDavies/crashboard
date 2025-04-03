import { NextRequest, NextResponse } from "next/server";
import { checkEmailsForUser } from "../../../lib/gmail-to-supabase";

export async function GET(req: NextRequest) {
  try {
    const userIds = [
      "de352401-7876-41de-b2c5-dd185d136bf4", // Your user_id
      "950243ce-da2a-422d-8692-e0f655d1d87e", // Ashley's user_id
    ];
    await Promise.all(userIds.map((userId) => checkEmailsForUser(userId)));
    return NextResponse.json({ message: "Polled Gmail for both users" }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}