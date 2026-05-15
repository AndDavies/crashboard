import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { BLOG_MEDIA_BUCKET, requireDashboardUser } from "@/lib/blog/data";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

function safeFileName(name: string) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "png";
  const base = name
    .replace(/\.[^.]+$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `${base || "image"}.${ext}`;
}

export async function POST(request: NextRequest) {
  const user = await requireDashboardUser();
  const formData = await request.formData();
  const file = formData.get("file");
  const postId = String(formData.get("postId") ?? "unassigned");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing image file." }, { status: 400 });
  }

  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    return NextResponse.json({ error: "Unsupported image type." }, { status: 400 });
  }

  if (file.size > MAX_IMAGE_BYTES) {
    return NextResponse.json({ error: "Image exceeds 10 MB." }, { status: 400 });
  }

  const admin = createAdminClient();
  const path = `${user.id}/${postId}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
  const { error } = await admin.storage
    .from(BLOG_MEDIA_BUCKET)
    .upload(path, file, {
      cacheControl: "31536000",
      contentType: file.type,
      upsert: false,
    });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data } = admin.storage.from(BLOG_MEDIA_BUCKET).getPublicUrl(path);

  return NextResponse.json({ path, url: data.publicUrl });
}
