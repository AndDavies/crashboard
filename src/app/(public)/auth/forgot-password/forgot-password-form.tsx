"use client";

import { createClient } from "@/lib/supabase/client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    const trimmed = email.trim();
    if (!trimmed) {
      setMessage("Enter your email address.");
      return;
    }
    setPending(true);
    const supabase = createClient();
    const origin = window.location.origin;
    const redirectTo = `${origin}/auth/callback?next=${encodeURIComponent("/auth/update-password")}`;
    const { error } = await supabase.auth.resetPasswordForEmail(trimmed, {
      redirectTo,
    });
    setPending(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <div className="space-y-4 text-sm text-muted-foreground">
        <p>
          If an account exists for{" "}
          <span className="font-medium text-foreground">{email.trim()}</span>,
          Supabase has queued a reset email. The link expires after a short
          time.
        </p>
        <div className="rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-xs leading-relaxed">
          <p className="font-medium text-foreground">Not seeing it?</p>
          <ul className="mt-2 list-inside list-disc space-y-1">
            <li>
              Check <strong>Spam</strong>, <strong>Promotions</strong>, and
              “All Mail” — sender is often{" "}
              <code className="rounded bg-background px-1 py-0.5 text-[0.7rem]">
                noreply@mail.app.supabase.io
              </code>
            </li>
            <li>
              Wait a few minutes; free-tier delivery can be delayed.
            </li>
            <li>
              In the Supabase dashboard, open{" "}
              <strong>Authentication → Logs</strong> and confirm a{" "}
              <strong>recovery</strong> / <strong>mail.send</strong> event after
              you submit.
            </li>
          </ul>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="reset-email">Email</Label>
        <Input
          id="reset-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <Button type="submit" disabled={pending} className="w-full" size="lg">
        {pending ? "Sending…" : "Send reset link"}
      </Button>
      {message ? (
        <p className="text-center text-sm text-muted-foreground">{message}</p>
      ) : null}
    </form>
  );
}
