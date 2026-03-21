"use client";

import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = { nextPath: string };

export function LoginForm({ nextPath }: Props) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState<"password" | "magic" | null>(null);
  const [showMagicLink, setShowMagicLink] = useState(false);

  async function signInWithPassword(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setPending("password");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) {
      setPending(null);
      setMessage(error.message);
      return;
    }
    // Ensure session is flushed to cookies before RSC reads them.
    await supabase.auth.getSession();
    setPending(null);
    router.push(nextPath);
    router.refresh();
  }

  async function sendMagicLink() {
    setMessage(null);
    if (!email.trim()) {
      setMessage("Enter your email for a magic link.");
      return;
    }
    setPending("magic");
    const supabase = createClient();
    const origin = window.location.origin;
    const redirectTo = `${origin}/auth/callback?next=${encodeURIComponent(nextPath)}`;
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: redirectTo },
    });
    setPending(null);
    if (error) {
      setMessage(error.message);
      return;
    }
    setMessage("Check your email for the sign-in link.");
  }

  return (
    <div className="w-full space-y-6">
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">
          Email and password
        </p>
        <p className="text-xs text-muted-foreground">
          Supabase signs you in with the email on your account (not a separate
          username). Sessions stay signed in on this device until you log out.
        </p>
      </div>

      <form onSubmit={signInWithPassword} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="password">Password</Label>
            <Link
              href="/auth/forgot-password"
              className="text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Forgot password?
            </Link>
          </div>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <Button
          type="submit"
          disabled={pending !== null}
          className="w-full"
          size="lg"
        >
          {pending === "password" ? "Signing in…" : "Sign in"}
        </Button>
      </form>

      <div className="border-t border-border pt-5">
        <button
          type="button"
          onClick={() => setShowMagicLink((v) => !v)}
          className="text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-expanded={showMagicLink}
        >
          {showMagicLink ? "Hide email link option" : "Sign in with email link instead"}
        </button>
        {showMagicLink ? (
          <div className="mt-4 space-y-3">
            <p className="text-xs text-muted-foreground">
              We’ll send a one-time link to the email above. Same session rules
              apply after you open it.
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={sendMagicLink}
              disabled={pending !== null}
              className="w-full"
              size="lg"
            >
              {pending === "magic" ? "Sending link…" : "Email me a magic link"}
            </Button>
          </div>
        ) : null}
      </div>

      {message ? (
        <p className="text-center text-sm text-muted-foreground">{message}</p>
      ) : null}
    </div>
  );
}
