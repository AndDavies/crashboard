import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Crashboard Dashboard",
  description: "Private Crashboard operations and intelligence workspace.",
};

export default function DashboardPage() {
  redirect("/dashboard/intelligence");
}
