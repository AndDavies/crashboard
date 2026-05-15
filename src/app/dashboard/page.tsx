import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Blog CMS · Crashboard",
  description: "Private blog content manager for Crashboard.",
};

export default function DashboardPage() {
  redirect("/dashboard/content/blog");
}
