import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireDashboardUser } from "@/lib/blog/data";
import { reviewTopicMergeSuggestion } from "@/lib/intelligence/topic-merge-reviews";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const IdSchema = z.string().uuid();
const ReviewSchema = z.object({
  decision: z.enum(["approve", "reject"]),
  targetId: z.string().uuid(),
}).strict();

function reviewErrorStatus(message: string) {
  if (message.toLowerCase().includes("not found")) return 404;
  if (
    message.includes("changed") ||
    message.includes("no longer") ||
    message.includes("pending merge") ||
    message.includes("outside the manual review range")
  ) return 409;
  return 500;
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const user = await requireDashboardUser().catch(() => null);
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const params = await context.params;
  const candidateId = IdSchema.safeParse(params.id);
  const body = ReviewSchema.safeParse(await request.json().catch(() => null));
  if (!candidateId.success || !body.success) {
    return NextResponse.json({ error: "Invalid topic review." }, { status: 400 });
  }

  try {
    const result = await reviewTopicMergeSuggestion(
      createAdminClient(),
      user.id,
      {
        candidateId: candidateId.data,
        targetId: body.data.targetId,
        decision: body.data.decision,
      },
    );
    return NextResponse.json({ result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Topic review failed.";
    return NextResponse.json({ error: message }, { status: reviewErrorStatus(message) });
  }
}
