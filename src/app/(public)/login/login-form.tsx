"use client";

import { createClient } from "@/lib/supabase/client";
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

  async function signInWithPassword(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setPending("password");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setPending(null);
    if (error) {
      setMessage(error.message);
      return;
    }
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
          <Label htmlFor="password">Password</Label>
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
      <div className="relative text-center text-xs text-muted-foreground">
        <span className="relative z-10 bg-card px-2">or</span>
        <span
          className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-border"
          aria-hidden
        />
      </div>
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
      {message ? (
        <p className="text-center text-sm text-muted-foreground">{message}</p>
      ) : null}
    </div>
  );
}
