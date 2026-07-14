"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

export function SignOutButton({ authMode }: { authMode: "google" | "supabase" }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  if (authMode === "google") {
    return (
      <form action="/api/auth/logout" method="post">
        <Button type="submit" variant="outline" size="sm">Sign out</Button>
      </form>
    );
  }
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        await createClient().auth.signOut();
        router.push("/");
        router.refresh();
      }}
    >
      {pending ? "Signing out…" : "Sign out"}
    </Button>
  );
}
